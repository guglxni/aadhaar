import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Aadhaar UIDAI Sandbox Server is running!';
  }
} 