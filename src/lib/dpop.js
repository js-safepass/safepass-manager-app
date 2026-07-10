const textEncoder = new TextEncoder();

function base64urlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlEncodeJson(value) {
  return base64urlEncode(textEncoder.encode(JSON.stringify(value)));
}

function derToJose(signature, outputLength) {
  const der = new Uint8Array(signature);
  if (der.length === outputLength) {
    return der;
  }
  if (der.length < 8 || der[0] !== 0x30) {
    throw new Error('Invalid DER signature');
  }

  let offset = 2;
  if (der[1] & 0x80) {
    const lengthBytes = der[1] & 0x7f;
    offset = 2 + lengthBytes;
  }

  if (der[offset] !== 0x02) {
    throw new Error('Invalid DER signature');
  }

  const rLength = der[offset + 1];
  const rStart = offset + 2;
  const rEnd = rStart + rLength;
  const r = der.slice(rStart, rEnd);

  offset = rEnd;
  if (der[offset] !== 0x02) {
    throw new Error('Invalid DER signature');
  }

  const sLength = der[offset + 1];
  const sStart = offset + 2;
  const sEnd = sStart + sLength;
  const s = der.slice(sStart, sEnd);

  const halfLength = outputLength / 2;
  const rTrimmed = r[0] === 0 ? r.slice(1) : r;
  const sTrimmed = s[0] === 0 ? s.slice(1) : s;

  const rPadded = new Uint8Array(halfLength);
  const sPadded = new Uint8Array(halfLength);

  if (rTrimmed.length > halfLength || sTrimmed.length > halfLength) {
    throw new Error('Invalid DER signature length');
  }

  rPadded.set(rTrimmed, halfLength - rTrimmed.length);
  sPadded.set(sTrimmed, halfLength - sTrimmed.length);

  const jose = new Uint8Array(outputLength);
  jose.set(rPadded, 0);
  jose.set(sPadded, halfLength);
  return jose;
}

export async function generateDpopKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['sign', 'verify'],
  );
}

export async function exportPublicJwk(keyPair) {
  return crypto.subtle.exportKey('jwk', keyPair.publicKey);
}

async function signJwtEs256(header, payload, privateKey) {
  const encodedHeader = base64urlEncodeJson(header);
  const encodedPayload = base64urlEncodeJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    textEncoder.encode(signingInput),
  );
  const joseSignature = derToJose(signature, 64);
  const encodedSignature = base64urlEncode(joseSignature);
  return `${signingInput}.${encodedSignature}`;
}

export async function buildDpopProof({ method, htu, bearer, keyPair, publicJwk }) {
  const athBytes = await crypto.subtle.digest('SHA-256', textEncoder.encode(bearer));
  const ath = base64urlEncode(new Uint8Array(athBytes));

  const header = { typ: 'dpop+jwt', alg: 'ES256', jwk: publicJwk };
  const payload = {
    htm: method.toUpperCase(),
    htu,
    iat: Math.floor(Date.now() / 1000),
    jti: crypto.randomUUID(),
    ath,
  };

  return signJwtEs256(header, payload, keyPair.privateKey);
}

export function formatApiError(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  return 'Unexpected error';
}
