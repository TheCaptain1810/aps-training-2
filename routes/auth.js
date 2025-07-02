const express = require("express");
const { getViewerToken } = require("../services/aps.js");

let router = express.Router();

router.get("/api/auth/token", async (req, res, next) => {
  try {
    res.json(await getViewerToken());
  } catch (error) {
    next(error);
  }
});

module.exports = router;
