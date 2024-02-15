const express = require("express");
const axios = require("axios");
const { StatusCodes } = require("http-status-codes");

const CONSTANTS = require("../utils/const.js");
const manager = require("../utils/manager.js");
const dashboard = require("../utils/dashboard.js");
const safeHandler = require("../utils/safe_handler.js");
const expressUtils = require("../utils/express.js");
const appUtils = require("../utils/app.js");
const validateToken = require("../middleware/validate_token.js");

const router = express.Router();

// Serve static Vue app out of /app/dist
router.use("/js", express.static("/app/dist/js"));
router.use("/css", express.static("/app/dist/css"));
router.use("/img", express.static("/app/dist/img"));
router.use("/favicon.png", express.static("/app/dist/favicon.png"));
router.use("/favicon.ico", express.static("/app/dist/favicon.ico"));
router.use(express.json());

router.get("/", safeHandler(validateToken.mw()), (req, res) => {
  res.sendFile("/app/dist/index.html");
});

router.post(
  "/v1/account/login",
  safeHandler(async (req, res) => {
    let response;
    try {
      response = await axios.post(
        `http://${process.env.UMBRELD_RPC_HOST}/trpc/user.login`,
        req.body
      );
    } catch (e) {
      console.log({ e });
      if (e.isAxiosError === true) {
        return res.status(e.response.status).send(e.response.data);
      }

      throw e;
    }

    let proxyToken = "";

    const setCookieHeader = response.headers["set-cookie"];
    if (setCookieHeader) {
      // `set-cookie` header can be an array if multiple cookies are set
      setCookieHeader.forEach((cookie) => {
        if (cookie.startsWith("UMBREL_PROXY_TOKEN=")) {
          proxyToken = cookie.split(";")[0].split("=")[1];
        }
      });
    }

    if (proxyToken) {
      const ONE_SECOND = 1000;
      const ONE_MINUTE = 60 * ONE_SECOND;
      const ONE_HOUR = 60 * ONE_MINUTE;
      const ONE_DAY = 24 * ONE_HOUR;
      const ONE_WEEK = 7 * ONE_DAY;
      const expires = new Date(Date.now() + ONE_WEEK);
      res
        .cookie("UMBREL_PROXY_TOKEN", proxyToken, {
          httpOnly: true,
          expires,
          sameSite: "lax",
        })
        .json(await validateToken.redirectState(proxyToken, req));
    } else {
      // This case should never happen as an error is thrown
      // if the credentials are bad and is handled above (catch block)
      res.status(StatusCodes.UNAUTHORIZED).send("Failed to authenticate");
    }
  })
);

// Get wallpaper (public)
router.get(
  "/v1/account/wallpaper",
  safeHandler(async (req, res) => {
    res.send((await manager.account.wallpaper()).data);
  })
);

// Get basic info for an app
router.get(
  "/v1/apps",
  safeHandler(async (req, res) => {
    const appIdSanitised = appUtils.sanitiseId(
      expressUtils.getQueryParam(req, "app")
    );
    res.send(await appUtils.getBasicInfo(appIdSanitised));
  })
);

router.get(
  "/wallpapers/:filename(\\d+[.]\\w+)",
  safeHandler(async (req, res) => {
    const response = await dashboard.wallpaper.get(req.params.filename);
    response.data.pipe(res);
  })
);

module.exports = router;
