import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AadhaarProvider } from '../src/modules/auth/providers/aadhaar.provider';
import { AuthService } from '../src/modules/auth/services/auth.service';
import { AuditLogger } from '../src/common/logging/audit-logger.service';
import { ConfigService } from '@nestjs/config';

describe('Error 998/A202 Retry Logic', () => {
  let authController: AuthController;
  let aadhaarProvider: AadhaarProvider;
  let mockLogger: jest.Mocked<AuditLogger>;

  const mockRetryScenario = async (
    errorSequence: Array<{ err: string; actn?: string }>,
    expectedRetries: number
  ) => {
    let callCount = 0;
    
    jest.spyOn(aadhaarProvider, 'initiateAuth').mockImplementation(async () => {
      const currentError = errorSequence[Math.min(callCount, errorSequence.length - 1)];
      callCount++;
      
      if (currentError.err === '998' && currentError.actn === 'A202') {
        throw new HttpException(
          `UIDAI OTP service temporarily unavailable (Error ${currentError.err}/A202). Please retry after 30-60 seconds.`,
          HttpStatus.SERVICE_UNAVAILABLE
        );
      } else if (currentError.err === '000') {
        return { qrDataUrl: 'mock-qr', txnId: 'mock-txn', authUrl: 'mock-url' };
      } else {
        throw new HttpException(`Error ${currentError.err}`, HttpStatus.BAD_REQUEST);
      }
    });

    try {
      // Mock the request and response objects
      const mockReq = { correlationId: 'test-correlation-id' } as any;
      const mockRes = { json: jest.fn() } as any;
      
      const result = await authController.getQrCode(mockReq, 'http://localhost:3002/callback', '999999990019', mockRes);
      return { success: true, result, retries: callCount - 1 };
    } catch (error) {
      return { success: false, error, retries: callCount - 1 };
    }
  };

  beforeEach(async () => {
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      logWithContext: jest.fn(),
      warnWithContext: jest.fn(),
      errorWithContext: jest.fn(),
    } as any;

    const mockAadhaarProvider = {
      initiateAuth: jest.fn(),
      maskData: jest.fn((data) => data.substring(0, 4) + '****' + data.substring(data.length - 4)),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AadhaarProvider, useValue: mockAadhaarProvider },
        { provide: AuditLogger, useValue: mockLogger },
        { 
          provide: AuthService, 
          useValue: {
            // Mock AuthService methods if needed
            createSession: jest.fn(),
            getSession: jest.fn(),
          }
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-value'),
            getOrThrow: jest.fn().mockReturnValue('test-value'),
          }
        }
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
    aadhaarProvider = module.get<AadhaarProvider>(AadhaarProvider);
  });

  describe('Exponential Backoff Timing', () => {
    beforeEach(() => {
      // Use fake timers to avoid real delays in CI
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should retry with exponential backoff: 30s, 60s, 120s', async () => {
      const delays: number[] = [];
      
      // Mock setTimeout to capture delays
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn((callback, delay) => {
        delays.push(delay);
        // Immediately execute callback for test speed
        callback();
        return 1 as any;
      }) as any;

      const errorSequence = [
        { err: '998', actn: 'A202' },
        { err: '998', actn: 'A202' },
        { err: '998', actn: 'A202' },
        { err: '998', actn: 'A202' }, // Final failure
      ];

      const result = await mockRetryScenario(errorSequence, 3);

      expect(result.success).toBe(false);
      expect(result.retries).toBe(3);
      expect(delays).toEqual([30000, 60000, 120000]); // 30s, 60s, 120s

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'test-correlation-id',
        'RETRYING_AFTER_UIDAI_OUTAGE',
        expect.objectContaining({
          attempt: 1,
          maxRetries: 3,
          retryDelay: 30000,
          nextRetryIn: '30 seconds',
        })
      );
    }, 10000);

    it('should succeed on second attempt after one retry', async () => {
      const delays: number[] = [];
      
      global.setTimeout = jest.fn((callback, delay) => {
        delays.push(delay);
        return setTimeout(callback, 0);
      }) as any;

      const errorSequence = [
        { err: '998', actn: 'A202' }, // First attempt fails
        { err: '000' },              // Second attempt succeeds
      ];

      const result = await mockRetryScenario(errorSequence, 1);

      expect(result.success).toBe(true);
      expect(result.retries).toBe(1);
      expect(delays).toEqual([30000]); // Only one retry delay
    });
  });

  describe('Error Classification', () => {
    it('should retry only for Error 998/A202', async () => {
      const nonRetryableErrors = [
        { err: '523' },           // Timestamp error
        { err: '940' },           // Auth failure  
        { err: '998', actn: 'A201' }, // Invalid UID
        { err: '565' },           // Other error
      ];

      for (const errorCase of nonRetryableErrors) {
        const result = await mockRetryScenario([errorCase], 0);
        
        expect(result.success).toBe(false);
        expect(result.retries).toBe(0); // No retries for non-retryable errors
      }
    });

    it('should distinguish between 998/A201 and 998/A202', async () => {
      // Test A201 (no retry)
      const a201Result = await mockRetryScenario([{ err: '998', actn: 'A201' }], 0);
      expect(a201Result.retries).toBe(0);
      
      // Test A202 (with retry)
      const delays: number[] = [];
      global.setTimeout = jest.fn((callback, delay) => {
        delays.push(delay);
        return setTimeout(callback, 0);
      }) as any;

      const a202Result = await mockRetryScenario([
        { err: '998', actn: 'A202' },
        { err: '998', actn: 'A202' }
      ], 1);
      
      expect(a202Result.retries).toBe(1);
      expect(delays.length).toBe(1);
    });
  });

  describe('Retry Limits', () => {
    it('should stop after 3 retries and fail', async () => {
      const delays: number[] = [];
      global.setTimeout = jest.fn((callback, delay) => {
        delays.push(delay);
        return setTimeout(callback, 0);
      }) as any;

      // All attempts return A202
      const errorSequence = Array(5).fill({ err: '998', actn: 'A202' });
      const result = await mockRetryScenario(errorSequence, 3);

      expect(result.success).toBe(false);
      expect(result.retries).toBe(3); // Exactly 3 retries
      expect(delays).toEqual([30000, 60000, 120000]);
      
      expect(result.error).toEqual(
        expect.objectContaining({
          status: HttpStatus.SERVICE_UNAVAILABLE,
          message: expect.stringContaining('Error 998/A202')
        })
      );
    });
  });

  describe('Success Scenarios', () => {
    it('should succeed immediately without retries', async () => {
      const result = await mockRetryScenario([{ err: '000' }], 0);
      
      expect(result.success).toBe(true);
      expect(result.retries).toBe(0);
      expect(result.result).toEqual({
        qrDataUrl: 'mock-qr',
        txnId: 'mock-txn',
        authUrl: 'mock-url'
      });
    });

    it('should succeed after recovery on third attempt', async () => {
      const delays: number[] = [];
      global.setTimeout = jest.fn((callback, delay) => {
        delays.push(delay);
        callback(); // Execute immediately for tests
        return 1 as any;
      }) as any;

      const errorSequence = [
        { err: '998', actn: 'A202' }, // First fails
        { err: '998', actn: 'A202' }, // Second fails  
        { err: '000' },              // Third succeeds
      ];

      const result = await mockRetryScenario(errorSequence, 2);

      expect(result.success).toBe(true);
      expect(result.retries).toBe(2);
      expect(delays).toEqual([30000, 60000]); // Two retry delays
    });
  });

  describe('Recovery Scenarios', () => {
    it('should fire success webhook when service recovers', async () => {
      const webhookCalls: string[] = [];
      
      // Mock webhook calls
      const originalConsoleLog = console.log;
      console.log = jest.fn((message) => {
        if (message.includes('QR_CODE_GENERATED_SUCCESS')) {
          webhookCalls.push('success_webhook');
        }
        originalConsoleLog(message);
      });

      global.setTimeout = jest.fn((callback) => {
        callback();
        return 1 as any;
      }) as any;

      // Service recovers after one outage
      const result = await mockRetryScenario([
        { err: '998', actn: 'A202' },
        { err: '000' }
      ], 1);

      expect(result.success).toBe(true);
      expect(mockLogger.log).toHaveBeenCalledWith(
        'test-correlation-id',
        'QR_CODE_GENERATED_SUCCESS',
        expect.objectContaining({
          attempt: 2
        })
      );

      console.log = originalConsoleLog;
    });

    it('should handle transition from A202 to different error', async () => {
      global.setTimeout = jest.fn((callback) => {
        callback();
        return 1 as any;
      }) as any;

      // Service comes back but with different error
      const result = await mockRetryScenario([
        { err: '998', actn: 'A202' },
        { err: '523' }  // Different error after retry
      ], 1);

      expect(result.success).toBe(false);
      expect(result.retries).toBe(1);
    });

    it('should log recovery attempts with correct timing', async () => {
      const delays: number[] = [];
      global.setTimeout = jest.fn((callback, delay) => {
        delays.push(delay);
        callback();
        return 1 as any;
      }) as any;

      await mockRetryScenario([
        { err: '998', actn: 'A202' },
        { err: '998', actn: 'A202' },
        { err: '000' }
      ], 2);

      // Verify escalating delays
      expect(delays).toEqual([30000, 60000]);
      
      // Verify logging of retry attempts
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenNthCalledWith(1,
        'test-correlation-id',
        'RETRYING_AFTER_UIDAI_OUTAGE',
        expect.objectContaining({
          attempt: 1,
          retryDelay: 30000
        })
      );
    });
  });

  describe('Logging Verification', () => {
    it('should log retry attempts with correct metadata', async () => {
      global.setTimeout = jest.fn((callback) => setTimeout(callback, 0)) as any;

      await mockRetryScenario([
        { err: '998', actn: 'A202' },
        { err: '000' }
      ], 1);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'test-correlation-id',
        'RETRYING_AFTER_UIDAI_OUTAGE',
        expect.objectContaining({
          attempt: 1,
          maxRetries: 3,
          retryDelay: 30000,
          nextRetryIn: '30 seconds',
          error: expect.stringContaining('998/A202'),
          correlationId: 'test-correlation-id'
        })
      );
    });

    it('should log successful completion after retries', async () => {
      global.setTimeout = jest.fn((callback) => setTimeout(callback, 0)) as any;

      await mockRetryScenario([
        { err: '998', actn: 'A202' },
        { err: '000' }
      ], 1);

      expect(mockLogger.log).toHaveBeenCalledWith(
        'test-correlation-id',
        'QR_CODE_GENERATED_SUCCESS',
        expect.objectContaining({
          uid: '9999****0019',
          txnId: 'mock-txn',
          attempt: 2,
          correlationId: 'test-correlation-id'
        })
      );
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
}); 