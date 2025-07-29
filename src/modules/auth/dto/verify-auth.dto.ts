import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyAuthDto {
  @IsString()
  @IsNotEmpty()
  uid: string;

  @IsString()
  @IsNotEmpty()
  otp: string;

  @IsString()
  @IsNotEmpty()
  txn: string;
} 