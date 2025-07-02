const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.resolve(__dirname, ".env") });

const config = {
  APS_CLIENT_ID: process.env.APS_CLIENT_ID,
  APS_CLIENT_SECRET: process.env.APS_CLIENT_SECRET,
  APS_BUCKET:
    process.env.APS_BUCKET ||
    `${process.env.APS_CLIENT_ID.toLowerCase()}-basic-app`,
  PORT: process.env.PORT || 8080,
};

module.exports = config;
