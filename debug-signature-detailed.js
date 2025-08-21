import crypto from 'crypto';

// Test data from the logs
const webhookSecret = '9adca9e7056fc561b2b4876918e1d42f47695c796834d0573d99695bf7d46937';
const eventBody = '{"object":"whatsapp_business_account","entry":[{"id":"1249293730123104","changes":[{"value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"6587685090","phone_number_id":"577888072085760"},"contacts":[{"profile":{"name":"Ajay Mamgain"},"wa_id":"919711123199"}],"messages":[{"from":"919711123199","id":"wamid.HBgMOTE5NzExMTIzMTk5FQIAEhggODkwRDE2NTZENjY1MDAwQ0M3NjdBOEI2MzkxMTNENEEA","timestamp":"1754798741","text":{"body":"Hello"},"type":"text"}]},"field":"messages"}]}]}';

console.log('=== DETAILED SIGNATURE ANALYSIS ===');
console.log('Webhook Secret:', webhookSecret);
console.log('Webhook Secret Length:', webhookSecret.length);
console.log('Webhook Secret Bytes:', Buffer.from(webhookSecret, 'utf8').length);

console.log('\nEvent Body Length:', eventBody.length);
console.log('Event Body Bytes:', Buffer.from(eventBody, 'utf8').length);

// Show first 100 characters with their byte representations
console.log('\nFirst 100 characters with byte values:');
for (let i = 0; i < Math.min(100, eventBody.length); i++) {
    const char = eventBody[i];
    const byte = eventBody.charCodeAt(i);
    console.log(`${i}: '${char}' (${byte})`);
}

// Calculate signature with different approaches
console.log('\n=== SIGNATURE CALCULATIONS ===');

// Method 1: Direct string
const sig1 = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(eventBody).digest('hex');
console.log('Method 1 (direct):', sig1);

// Method 2: Buffer from string
const sig2 = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(Buffer.from(eventBody, 'utf8')).digest('hex');
console.log('Method 2 (Buffer from string):', sig2);

// Method 3: Buffer from string with explicit encoding
const sig3 = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(Buffer.from(eventBody, 'ascii')).digest('hex');
console.log('Method 3 (Buffer ascii):', sig3);

// Method 4: Raw bytes
const sig4 = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(eventBody, 'utf8').digest('hex');
console.log('Method 4 (raw bytes):', sig4);

console.log('\nExpected from Lambda:', 'sha256=210ee611feb2ffa553c39c7adca3a576545ad4c01522fa5d4478df3b8f152dd8');

// Check if any match
const expected = 'sha256=210ee611feb2ffa553c39c7adca3a576545ad4c01522fa5d4478df3b8f152dd8';
console.log('\n=== MATCHES ===');
console.log('Method 1 matches:', sig1 === expected);
console.log('Method 2 matches:', sig2 === expected);
console.log('Method 3 matches:', sig3 === expected);
console.log('Method 4 matches:', sig4 === expected);

// Let's also check if there are any hidden characters by showing the raw bytes
console.log('\n=== RAW BYTES ANALYSIS ===');
const bodyBytes = Buffer.from(eventBody, 'utf8');
console.log('Body as hex:', bodyBytes.toString('hex').substring(0, 200) + '...');
console.log('Body as base64:', bodyBytes.toString('base64').substring(0, 100) + '...');
