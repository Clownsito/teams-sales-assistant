import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  // El orquestador (ECS, Container Apps, etc.) manda SIGTERM al reciclar la
  // instancia; con esto Nest cierra conexiones antes de salir (ADR-004).
  app.enableShutdownHooks();
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`teams-sales-assistant escuchando en :${port}`);
}

bootstrap();
