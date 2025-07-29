import { tmpdir } from 'os';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { execFileSync } from 'child_process';
import { wrapWithTemplate } from './xmlsec-template';

const TMP = tmpdir();

export function signWithXmlsec(rawXml: string,
                               privPem: string,
                               certPem: string): string {
  // 1. Build template
  const xml = wrapWithTemplate(rawXml);

  // 2. Write tmp files
  const ts = Date.now();
  const xmlPath = `${TMP}/uidai-${ts}.xml`;
  const outPath = `${TMP}/uidai-signed-${ts}.xml`;
  const keyPath = `${TMP}/key-${ts}.pem`;
  const certPath = `${TMP}/cert-${ts}.pem`;
  
  try {
    writeFileSync(xmlPath, xml);
    writeFileSync(keyPath, privPem);
    writeFileSync(certPath, certPem);

    // 3. Sign: --sign replaces empty nodes & embeds cert
    execFileSync('xmlsec1', [
      '--sign',
      '--lax-key-search',       // Enable lax key search for P12-extracted keys
      '--output', outPath,
      '--privkey-pem', `${keyPath},${certPath}`,
      xmlPath
    ], { stdio: 'inherit' });

    return readFileSync(outPath, 'utf8');
  } finally {
    // Cleanup temp files
    try {
      unlinkSync(xmlPath);
      unlinkSync(outPath);
      unlinkSync(keyPath);
      unlinkSync(certPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
} 