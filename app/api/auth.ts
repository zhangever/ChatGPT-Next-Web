import { NextRequest } from "next/server";
import { getServerSideConfig } from "../config/server";
import md5 from "spark-md5";
import { ACCESS_CODE_PREFIX } from "../constant";
import { v4 as uuidv4 } from "uuid";
import moment from "moment";

const IP_HEADERS = [
  "Magiccube-Req-Ip",
  "RemoteIp",
  "X-Real-IP",
  "X-Forwarded-For",
  "Proxy-Client-IP",
  "WL-Proxy-Client-IP",
  "HTTP_CLIENT_IP",
  "HTTP_X_FORWARDED_FOR",
];

function getIP(req: NextRequest) {
  let ip = "";
  for (const header of IP_HEADERS) {
    ip = req.headers.get(header) ?? "";
    if (ip) {
      ip = ip.split(",").at(0) ?? "";
      if (ip) {
        console.log(`[IP] ${header}: ${ip}`);
        break;
      }
    }
  }

  return ip;
}

const serverConfig = getServerSideConfig();

function parseApiKey(bearToken: string) {
  const token = bearToken.trim().replaceAll("Bearer ", "").trim();
  const isOpenAiKey = !token.startsWith(ACCESS_CODE_PREFIX);

  return {
    accessCode: isOpenAiKey ? "" : token.slice(ACCESS_CODE_PREFIX.length),
    apiKey: isOpenAiKey ? token : "",
  };
}

async function logReq(req: NextRequest) {
  const userIp = getIP(req);
  const currentTime = moment().format("YYYY-MM-DD HH:mm:ss");

  const traceId = uuidv4();

  req.headers.set("traceId", traceId);
  req.json().then((json) => {
    console.log(
      `[${currentTime}][${req.headers.get(
        "traceId",
      )}}][${userIp}][Req]:${json}`,
    );
  });
}

export function auth(req: NextRequest) {
  const authToken = req.headers.get("Authorization") ?? "";

  // check if it is openai api key or user token
  const { accessCode, apiKey: token } = parseApiKey(authToken);

  const hashedCode = md5.hash(accessCode ?? "").trim();

  console.log("[Auth] allowed hashed codes: ", [...serverConfig.codes]);
  console.log("[Auth] got access code:", accessCode);
  console.log("[Auth] hashed access code:", hashedCode);

  logReq(req);

  if (serverConfig.needCode && !serverConfig.codes.has(hashedCode) && !token) {
    return {
      error: true,
      needAccessCode: true,
      msg: "Please go settings page and fill your access code.",
    };
  }

  // if user does not provide an api key, inject system api key
  if (!token) {
    const apiKey = serverConfig.apiKey;
    if (apiKey) {
      console.log("[Auth] use system api key");
      req.headers.set("Authorization", `Bearer ${apiKey}`);
    } else {
      console.log("[Auth] admin did not provide an api key");
      return {
        error: true,
        msg: "Empty Api Key",
      };
    }
  } else {
    console.log("[Auth] use user api key");
  }

  return {
    error: false,
  };
}
