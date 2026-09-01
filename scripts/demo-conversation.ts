/**
 * Demo: simula una conversación completa contra el bot mandando Activities de
 * Bot Framework a POST /api/messages, en un solo hilo (memoria de conversación
 * incluida). Imprime cada pregunta/respuesta con colores y guarda el
 * transcript en demo-transcript.md.
 *
 * REQUISITO: el bot tiene que estar corriendo antes ->  npm run start:dev
 * (en otra terminal). Para que las preguntas "raras" las conteste la IA hace
 * falta ANTHROPIC_API_KEY en el .env; sin eso responden el mensaje de ayuda.
 *
 *   npm run demo        (o)   npx ts-node scripts/demo-conversation.ts
 */
import * as http from 'node:http';
import { writeFile } from 'node:fs/promises';
import { AddressInfo } from 'node:net';

const BOT_URL = process.env.BOT_URL ?? 'http://localhost:3000/api/messages';
const FROM_ID = 'seller-1';
const CONVERSATION_ID = `demo-${Date.now()}`; // hilo único por corrida
const OUT_FILE = 'demo-transcript.md';
const TURN_TIMEOUT_MS = 30_000;

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

interface Turn {
  title: string;
  capability: string;
  question: string;
}

// Una pregunta por capacidad + seguimientos que solo andan con memoria +
// preguntas fuera de patrón que caen al fallback de IA.
const TURNS: Turn[] = [
  {
    title: 'Consulta de stock por precio',
    capability: 'stock-lookup',
    question: '¿Qué teléfonos tienen entre 20.000 y 50.000?',
  },
  {
    title: 'Comisión del mes',
    capability: 'commission-summary',
    question: '¿Cuánto llevo ganado este mes con 8% de comisión?',
  },
  {
    title: 'Margen costo / venta',
    capability: 'margin-calculator',
    question: 'Si me cuesta 34.000 y lo vendo a 40.000, ¿qué margen me queda?',
  },
  {
    title: 'Seguimiento del margen (memoria)',
    capability: 'follow-up',
    question: '¿Y si el costo sube a 36.000?',
  },
  {
    title: 'Proyección de venta',
    capability: 'sale-projection',
    question: '¿Cuánto ganaría si vendo 10 iPhone SE con 8% de comisión?',
  },
  {
    title: 'Seguimiento de la proyección: precio (memoria)',
    capability: 'follow-up',
    question: '¿Y si lo vendo 10% más caro?',
  },
  {
    title: 'Seguimiento de la proyección: comisión (memoria)',
    capability: 'follow-up',
    question: '¿Y con 12% de comisión?',
  },
  {
    title: 'Pregunta abierta (fallback de IA)',
    capability: 'ai-fallback',
    question:
      'Un cliente que arranca un emprendimiento, ¿le conviene más el iPhone SE o el Galaxy A15?',
  },
  {
    title: 'Objeción de precio (fallback de IA)',
    capability: 'ai-fallback',
    question: 'El cliente dice que en otro lado se lo dejan más barato, ¿qué le contesto?',
  },
];

/** Servidor local que hace de "connector": recibe las respuestas del bot. */
function startConnector(): Promise<{
  serviceUrl: string;
  nextReply: () => Promise<string>;
  close: () => void;
}> {
  const queue: string[] = [];
  const waiters: ((text: string) => void)[] = [];

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (req.method === 'POST') {
        try {
          const activity = JSON.parse(body);
          const text = typeof activity.text === 'string' ? activity.text : '';
          const waiter = waiters.shift();
          if (waiter) waiter(text);
          else queue.push(text);
        } catch {
          /* ignorar cuerpos que no sean JSON */
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: `reply-${Date.now()}` }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        serviceUrl: `http://127.0.0.1:${port}`,
        nextReply: () =>
          new Promise<string>((res, rej) => {
            const queued = queue.shift();
            if (queued !== undefined) return res(queued);
            const timer = setTimeout(
              () => rej(new Error('el bot no respondió a tiempo')),
              TURN_TIMEOUT_MS,
            );
            waiters.push((text) => {
              clearTimeout(timer);
              res(text);
            });
          }),
        close: () => server.close(),
      });
    });
  });
}

async function sendActivity(question: string, serviceUrl: string): Promise<void> {
  const activity = {
    type: 'message',
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    channelId: 'test',
    serviceUrl,
    from: { id: FROM_ID, name: 'Vendedor demo' },
    recipient: { id: 'bot', name: 'bot' },
    conversation: { id: CONVERSATION_ID },
    text: question,
  };

  const response = await fetch(BOT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(activity),
  });
  if (!response.ok) {
    throw new Error(`el webhook respondió ${response.status}`);
  }
}

function printHeader(n: number, turn: Turn): void {
  const line = '─'.repeat(64);
  console.log(`\n${c.dim}${line}${c.reset}`);
  console.log(
    `${c.bold}${c.cyan} ${n}. ${turn.title}${c.reset}   ${c.dim}${c.yellow}[${turn.capability}]${c.reset}`,
  );
  console.log(`${c.dim}${line}${c.reset}`);
}

function printExchange(question: string, answer: string): void {
  console.log(`${c.bold}🧑  ${c.reset}${question}\n`);
  const answerLines = answer.split('\n');
  console.log(`${c.bold}${c.green}🤖  ${c.reset}${c.green}${answerLines[0]}${c.reset}`);
  for (const extra of answerLines.slice(1)) {
    console.log(`    ${c.green}${extra}${c.reset}`);
  }
}

function toMarkdown(results: { turn: Turn; answer: string }[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const head = [
    '# Demo — Teams Sales Assistant',
    '',
    'Conversación simulada contra el bot (`POST /api/messages`, formato Activity de',
    `Bot Framework). Un solo hilo (\`conversation.id\` fijo), \`from.id = ${FROM_ID}\`.`,
    `Generado el ${today}.`,
    '',
  ];

  const body = results.flatMap(({ turn }, i) => {
    const answer = results[i].answer
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n');
    return [
      '---',
      '',
      `## ${i + 1}. ${turn.title}  ·  \`${turn.capability}\``,
      '',
      '**🧑 Vendedor**',
      '',
      `> ${turn.question}`,
      '',
      '**🤖 Asistente**',
      '',
      answer,
      '',
    ];
  });

  return [...head, ...body].join('\n');
}

async function main(): Promise<void> {
  const connector = await startConnector();
  console.log(
    `${c.bold}Demo — Teams Sales Assistant${c.reset}\n` +
      `${c.dim}bot: ${BOT_URL}  ·  hilo: ${CONVERSATION_ID}${c.reset}`,
  );

  const results: { turn: Turn; answer: string }[] = [];

  try {
    for (let i = 0; i < TURNS.length; i++) {
      const turn = TURNS[i];
      printHeader(i + 1, turn);
      await sendActivity(turn.question, connector.serviceUrl);
      const answer = await connector.nextReply();
      printExchange(turn.question, answer);
      results.push({ turn, answer });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      console.error(
        `\n${c.red}No pude conectar con el bot en ${BOT_URL}.${c.reset}\n` +
          `${c.yellow}Arrancá el bot primero:  npm run start:dev${c.reset}`,
      );
    } else {
      console.error(`\n${c.red}Error: ${msg}${c.reset}`);
    }
    connector.close();
    process.exitCode = 1;
    return;
  }

  await writeFile(OUT_FILE, toMarkdown(results), 'utf8');
  console.log(
    `\n${c.dim}${'─'.repeat(64)}${c.reset}\n` +
      `${c.green}✓ ${results.length} turnos. Transcript guardado en ${OUT_FILE}${c.reset}`,
  );
  connector.close();
}

void main();
