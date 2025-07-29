export function wrapWithTemplate(xml: string): string {
  // 1. Handle self-closing tags by converting them to open/close tags for signature injection
  // Check if this is a self-closing tag
  if (xml.includes('/>')) {
    // Find the root element name
    const rootMatch = xml.match(/<(\w+)\s/);
    if (rootMatch) {
      const rootElementName = rootMatch[1];
      // Convert self-closing tag to open/close tags
      xml = xml.replace('/>', `></${rootElementName}>`);
    }
  }

  // 2. inject an empty <Signature/> right after root start-tag
  const [, openTag, rest] = xml.match(/^(\s*<[^>]+>)([\s\S]+)/)!;
  return `${openTag}
<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
  <SignedInfo>
    <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
    <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
    <Reference URI="">
      <Transforms>
        <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
      </Transforms>
      <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
      <DigestValue/>
    </Reference>
  </SignedInfo>
  <SignatureValue/>
  <KeyInfo>
    <X509Data><X509Certificate/></X509Data>
  </KeyInfo>
</Signature>
${rest}`;
} 