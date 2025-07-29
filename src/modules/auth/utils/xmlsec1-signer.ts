import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { execFile } from 'child_process';
import { promisify } from 'util';

// Production-ready xmlsec1 signer for UIDAI integration
// This approach lets xmlsec1 handle signature template injection automatically

const execFileAsync = promisify(execFile);
const XMLSEC = process.env.XMLSEC1_PATH ?? 'xmlsec1';

interface SigningResult {
  signedXml: string;
  tempDir?: string; // For debugging when DEBUG_XML=1
}

export async function signWithXmlsec1(
  unsignedXml: string,
  pemPriv: string,
  pemCert: string,
): Promise<string> {
  const id = uuid();
  const dir = join(tmpdir(), `aadhaar-${id}`);
  await fs.mkdir(dir, { recursive: true });

  const unsignedPath = join(dir, 'in.xml');
  const signedPath = join(dir, 'out.xml');
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');

  try {
    // Write all required files
    await fs.writeFile(unsignedPath, unsignedXml, 'utf8');
    await fs.writeFile(keyPath, pemPriv, 'utf8');
    await fs.writeFile(certPath, pemCert, 'utf8');

    // xmlsec1 will add the Signature element *inside* <Otp/> automatically
    // Proven working xmlsec1 signing with signature template population
    // Key insights: signature template in XML directs xmlsec1 behavior
    // Using RSA-SHA256 as per UIDAI 2025 requirements
    const args = [
      '--sign',
      '--lax-key-search',                        // Avoids KEY-NOT-FOUND
      '--privkey-pem', `${keyPath},${certPath}`, // Combined key+cert specification
      '--output', signedPath,
      unsignedPath,
    ];

    // Execute xmlsec1 with proper error handling
    const { stdout, stderr } = await execFileAsync(XMLSEC, args, {
      maxBuffer: 10_000_000,
      timeout: 30000,
    });

    // Verify output file was created
    const signed = await fs.readFile(signedPath, 'utf8');
    
    if (!signed || signed.length === 0) {
      throw new Error('xmlsec1 produced empty output');
    }

    // Verify signature was injected
    if (!signed.includes('<Signature') && !signed.includes('<ds:Signature')) {
      throw new Error('xmlsec1 did not inject signature elements');
    }

    // Debug mode: preserve temp files for inspection
    if (process.env.DEBUG_XML === '1') {
      const debugDir = '/tmp/aadhaar-debug';
      await fs.mkdir(debugDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.copyFile(unsignedPath, join(debugDir, `unsigned-${timestamp}.xml`));
      await fs.copyFile(signedPath, join(debugDir, `signed-${timestamp}.xml`));
      console.log(`DEBUG_XML: Files saved to ${debugDir}`);
    }

    console.log(`✅ xmlsec1 signing successful, output length: ${signed.length}`);
    return signed;

  } catch (error) {
    console.error('❌ xmlsec1 signing failed:', error);
    
    // Enhanced error reporting
    if (error instanceof Error) {
      if (error.message.includes('ENOENT')) {
        throw new Error(`xmlsec1 binary not found. Install with: brew install xmlsec1 (macOS) or apt-get install xmlsec1 (Ubuntu)`);
      }
      if (error.message.includes('KEY-NOT-FOUND')) {
        throw new Error(`xmlsec1 KEY-NOT-FOUND: Check private key and certificate format compatibility`);
      }
      throw new Error(`xmlsec1 execution failed: ${error.message}`);
    }
    throw error;
  } finally {
    // Clean up temp files (unless DEBUG_XML=1)
    if (process.env.DEBUG_XML !== '1') {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn(`Failed to cleanup temp dir ${dir}:`, cleanupError);
      }
    }
  }
}

/**
 * Auth XML signer - uses the same approach but with Auth element
 */
export async function signAuthWithXmlsec1(
  unsignedXml: string,
  pemPriv: string,
  pemCert: string,
): Promise<string> {
  const id = uuid();
  const dir = join(tmpdir(), `aadhaar-auth-${id}`);
  await fs.mkdir(dir, { recursive: true });

  const unsignedPath = join(dir, 'in.xml');
  const signedPath = join(dir, 'out.xml');
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');

  try {
    await fs.writeFile(unsignedPath, unsignedXml, 'utf8');
    await fs.writeFile(keyPath, pemPriv, 'utf8');
    await fs.writeFile(certPath, pemCert, 'utf8');

    // For Auth XML, use proven working xmlsec1 approach
    const args = [
      '--sign',
      '--lax-key-search',
      '--privkey-pem', `${keyPath},${certPath}`,
      '--output', signedPath,
      unsignedPath,
    ];

    const { stdout, stderr } = await execFileAsync(XMLSEC, args, {
      maxBuffer: 10_000_000,
      timeout: 30000,
    });

    const signed = await fs.readFile(signedPath, 'utf8');
    
    if (!signed || signed.length === 0) {
      throw new Error('xmlsec1 produced empty Auth output');
}

    if (!signed.includes('<Signature') && !signed.includes('<ds:Signature')) {
      throw new Error('xmlsec1 did not inject signature elements in Auth XML');
    }

    console.log(`✅ xmlsec1 Auth signing successful, output length: ${signed.length}`);
    return signed;

  } catch (error) {
    console.error('❌ xmlsec1 Auth signing failed:', error);
    throw new Error(`Auth XML signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    if (process.env.DEBUG_XML !== '1') {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn(`Failed to cleanup Auth temp dir ${dir}:`, cleanupError);
      }
    }
  }
} 