import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
dotenv.config(); // This loads the .env file
import helmet from 'helmet';
import * as cors from 'cors';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as express from 'express';
import * as path from 'path';
import * as bodyParser from 'body-parser';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { AuditLogger } from './common/logging/audit-logger.service';
import { CorrelationIdInterceptor } from './common/interceptors/correlation.interceptor';
import { PerformanceInterceptor } from './common/interceptors/performance.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥💥💥 UNHANDLED REJECTION 💥💥💥');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
});

async function bootstrap() {
  // Use Nest's built-in logger for bootstrapping and for the app
  const logger = new Logger('Bootstrap');
  
  try {
    logger.log('--- Starting Application Bootstrap ---');
    
    const app = await NestFactory.create(AppModule, {
      // Replace the default Nest logger with our custom AuditLogger
      logger: new AuditLogger('Bootstrap'),
    });
    logger.log('NestFactory created application instance.');
    
    const isDevelopment = process.env.NODE_ENV === 'development';
    logger.log(`Running in ${isDevelopment ? 'Development' : 'Production'} mode.`);

    // --- Security Middleware ---
    app.use(helmet({
        contentSecurityPolicy: false, // DISABLED FOR QR CODE DEBUGGING
        crossOriginEmbedderPolicy: false, // DISABLED FOR QR CODE DEBUGGING
        crossOriginOpenerPolicy: true,
        crossOriginResourcePolicy: { policy: 'same-site' },
        dnsPrefetchControl: { allow: false },
        frameguard: { action: 'deny' },
        hsts: {
            maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
        ieNoOpen: true,
        noSniff: true,
        originAgentCluster: true,
        permittedCrossDomainPolicies: { permittedPolicies: 'none' },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        xssFilter: true,
    }));
    logger.log('Helmet security middleware configured.');
    
    // --- Body Parser ---
    app.use(bodyParser.json({ limit: '1mb' }));
    app.use(bodyParser.urlencoded({ limit: '1mb', extended: true }));
    logger.log('BodyParser middleware configured.');

    // --- CORS Configuration ---
    app.enableCors({
      origin: ['http://localhost:8080', 'http://localhost:3002', 'http://localhost:3000', 'https://developer.uidai.gov.in']
        .concat(process.env.NODE_ENV === 'development' 
          ? ['http://localhost:8080', 'http://localhost:3002', 'http://localhost:3000']
          : []),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
    });
    logger.log('CORS middleware configured.');
    
    // --- Global Validation Pipe ---
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        skipMissingProperties: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    logger.log('Global ValidationPipe configured.');
    
    // --- Static Files ---
    const publicPath = path.join(__dirname, '..', 'public');
    app.use(express.static(publicPath));
    logger.log(`Serving static files from: ${publicPath}`);
    
    // --- Set up global interceptors and filters ---
    app.useGlobalInterceptors(new CorrelationIdInterceptor());
    app.useGlobalInterceptors(new PerformanceInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    
    // --- Port and Host Configuration ---
    const port = process.env.PORT || 3002;
    const host = '0.0.0.0'; // Listen on all available network interfaces
    
    logger.log(`Attempting to listen on ${host}:${port}`);
    
    // --- Start Listening ---
    await app.listen(port, host);
     
    logger.log('✅✅✅ SERVER IS LISTENING! ✅✅✅');
     
    // Log the application URL
    const url = await app.getUrl();
    logger.log(`🚀 Application is running on: ${url}`);
    logger.log('--- Bootstrap successful ---');

  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error('💥💥💥 BOOTSTRAP FAILED! 💥💥💥', error.stack);
    } else {
      logger.error('💥💥💥 BOOTSTRAP FAILED WITH UNKNOWN ERROR! 💥💥💥', error);
    }
    process.exit(1);
  }
}

bootstrap();