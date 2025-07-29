import { Controller, Get, HttpStatus } from '@nestjs/common';
import { Logger } from '@nestjs/common';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  /**
   * Health check endpoint for monitoring and uptime verification
   * @returns Object with status information
   */
  @Get('health')
  health() {
    this.logger.debug('Health check requested');
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || 'unknown'
    };
  }
} 