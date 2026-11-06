const nodemailer = require('nodemailer');

async function testSmtp() {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: 'shibu3190@gmail.com',
      pass: 'aurgocpkzydyzoie'
    }
  });

  const verified = await transporter.verify();
  console.log('Transporter verify result:', verified);
}

testSmtp().catch(console.error);
