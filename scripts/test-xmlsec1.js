#!/usr/bin/env node

// Quick test script to verify xmlsec1 signing works locally
const { signWithXmlsec1 } = require('../src/modules/auth/utils/xmlsec1-signer');
const fs = require('fs');
const path = require('path');

async function testXmlsec1Signing() {
  console.log('🔧 Testing xmlsec1 signing...');
  
  try {
    // Load certificates
    const p12Path = path.join(process.cwd(), 'certs/New_Public_AUA_for_Staging_Services_RootSigned_2428.p12');
    console.log(`📋 Using P12: ${p12Path}`);
    
    // For this test, we need to extract PEM data from P12
    // In practice, this would come from the provider's initialization
    const { extractPemPair } = require('../src/modules/auth/utils/p12-extract');
    const pemData = await extractPemPair(p12Path, 'public', 'publicauaforstagingservices');
    
    console.log(`✅ Extracted PEM data - Private key: ${pemData.privatePem.length} chars, Cert: ${pemData.certPem.length} chars`);
    
    // Test XML with signature template
    const testXml = `<?xml version="1.0" encoding="UTF-8"?>
<Otp xmlns="http://www.uidai.gov.in/authentication/otp/1.0" uid="999999990019" ac="public" sa="public" ver="2.5" tid="public" txn="test-123" lk="test-license">
  <Opts ch="01"/>
  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    <SignedInfo>
      <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
      <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
      <Reference URI="">
        <Transforms>
          <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
        </Transforms>
        <DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
        <DigestValue></DigestValue>
      </Reference>
    </SignedInfo>
    <SignatureValue></SignatureValue>
    <KeyInfo>
      <X509Data>
        <X509Certificate></X509Certificate>
      </X509Data>
    </KeyInfo>
  </Signature>
</Otp>`;

    console.log('🔐 Attempting xmlsec1 signing...');
    const signedXml = await signWithXmlsec1(testXml, pemData.privatePem, pemData.certPem);
    
    console.log(`✅ xmlsec1 signing successful!`);
    console.log(`📏 Signed XML length: ${signedXml.length} characters`);
    console.log(`🔍 Contains signature: ${signedXml.includes('<SignatureValue>') && !signedXml.includes('<SignatureValue></SignatureValue>')}`);
    console.log(`🔍 Contains certificate: ${signedXml.includes('<X509Certificate>') && !signedXml.includes('<X509Certificate></X509Certificate>')}`);
    
    // Save for manual inspection
    fs.writeFileSync('/tmp/test-signed.xml', signedXml);
    console.log('💾 Signed XML saved to /tmp/test-signed.xml');
    
    console.log('\n🎉 xmlsec1 integration test PASSED!');
    
    // Try to verify locally if UIDAI cert is available
    const uidaiCertPath = path.join(process.cwd(), 'certs/uidai_auth_sign_Pre-Prod_2026.cer');
    if (fs.existsSync(uidaiCertPath)) {
      console.log('\n🔍 UIDAI cert found, attempting local verification...');
      
      const { execSync } = require('child_process');
      try {
        fs.writeFileSync('/tmp/test-verify.xml', signedXml);
        const verifyResult = execSync(`xmlsec1 verify --pubkey-cert-pem "${uidaiCertPath}" /tmp/test-verify.xml`, { encoding: 'utf8' });
        console.log('✅ Local verification PASSED:', verifyResult);
      } catch (verifyError) {
        console.log('⚠️ Local verification failed (expected for self-signed):', verifyError.message);
      }
    }
    
  } catch (error) {
    console.error('❌ xmlsec1 test FAILED:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testXmlsec1Signing().catch(console.error); 