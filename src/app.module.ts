import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './modules/health/health.module';

// Configuration factory with sandbox defaults
const configuration = () => ({
  AUA_LICENSE_KEY: process.env.AUA_LICENSE_KEY || 'MG_g7jJVYUIW7cLYXY5yaqKD6D1TuhjTJTDPHcb0SudOhVpvpnsEw_A',
  ASA_LICENSE_KEY: process.env.ASA_LICENSE_KEY || 'MFoSig475ZNf8Fex6pRZJvFgXoOJhiC67s8cbKCTkkI43QB2a0vKlY8', // sandbox default
  AUA_CODE: process.env.AUA_CODE || 'public',
  SUB_AUA_CODE: process.env.SUB_AUA_CODE || 'public',
  UIDAI_BASE_URL: process.env.UIDAI_BASE_URL || 'https://developer.uidai.gov.in',
  UIDAI_STAGING_BASE_URL: process.env.UIDAI_STAGING_BASE_URL || 'https://developer.uidai.gov.in',
  UIDAI_STAGING_OTP_URL: process.env.UIDAI_STAGING_OTP_URL || 'https://developer.uidai.gov.in/uidotp/2.5',
  UIDAI_STAGING_AUTH_URL: process.env.UIDAI_STAGING_AUTH_URL || 'https://developer.uidai.gov.in/authserver/2.5',
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    AuthModule,
    CommonModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}