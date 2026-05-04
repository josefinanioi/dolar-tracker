const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();

console.log('\n✅ Claves VAPID generadas. Copialas en tu archivo .env:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('\n');
