import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { CrossDeviceController } from './controllers/cross-device.controller';
import { AuthService } from './services/auth.service';
import { CrossDeviceSessionService } from './services/cross-device-session.service';
import { AadhaarProvider } from './providers/aadhaar.provider';
import { CrossDeviceUidaiProvider } from './providers/cross-device-uidai.provider';
import { CrossDeviceGateway } from './gateways/cross-device.gateway';
import { AuditLogger } from '../../common/logging/audit-logger.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UidaiErrorRegistryService } from './services/uidai-error-registry.service';
import { UidaiErrorProcessorService } from './services/uidai-error-processor.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'cross-device-uidai-middleware-secret-key'),
        signOptions: { expiresIn: '60m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, CrossDeviceController],
  providers: [
    AuthService,
    CrossDeviceSessionService,
    AadhaarProvider,
    CrossDeviceUidaiProvider,
    CrossDeviceGateway,
    AuditLogger,
    UidaiErrorRegistryService,
    UidaiErrorProcessorService,
  ],
  exports: [
    AuthService, 
    CrossDeviceSessionService,
    AadhaarProvider, 
    CrossDeviceUidaiProvider,
    CrossDeviceGateway,
  ],
})
export class AuthModule {} 