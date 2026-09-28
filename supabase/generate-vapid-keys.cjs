const { generateKeyPairSync } = require('node:crypto');

const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1'
});
const publicJwk = publicKey.export({ format: 'jwk' });
const privateJwk = privateKey.export({ format: 'jwk' });
const applicationServerKey = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(publicJwk.x, 'base64url'),
    Buffer.from(publicJwk.y, 'base64url')
]).toString('base64url');

process.stdout.write(`${JSON.stringify({
    applicationServerKey,
    vapidKeys: {
        publicKey: publicJwk,
        privateKey: privateJwk
    }
}, null, 2)}\n`);
