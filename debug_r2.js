require('dotenv').config();
const r2Service = require('./src/services/r2.service');

async function testSigning() {
  const key = 'students/13/1770109554523-fef2668c222ca1ac-a79eaeb6_dbc2_47b0_9020_8905a84c1091.jpeg';
  console.log('Testing key:', key);
  try {
    const url = await r2Service.getSignedUrl(key);
    console.log('Signed URL:', url);
  } catch (error) {
    console.error('Error signing:', error);
  }
}

testSigning();
