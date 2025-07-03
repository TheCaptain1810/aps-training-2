const express = require("express");
const path = require("path");

const { PORT } = require("./config.js");

const app = express();

app.use(express.static(path.join(__dirname, "wwwroot")));
app.use(express.json()); // Add JSON parsing middleware

app.use(require("./routes/auth.js"));
app.use(require("./routes/buckets.js"));
app.use(require("./routes/models.js"));

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
