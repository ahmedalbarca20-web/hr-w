require('dotenv').config();
const { Company } = require('./src/models/index');
const { connectDB } = require('./src/config/db');

async function checkCompanies() {
    try {
        await connectDB();
        const companies = await Company.findAll();
        console.log('Total companies:', companies.length);
        companies.forEach(c => {
            console.log(`ID: ${c.id}, Name: ${c.name}, Active: ${c.is_active}`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkCompanies();
