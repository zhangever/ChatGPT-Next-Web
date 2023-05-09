import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "./app/config/server";
import md5 from "spark-md5";
import { v4 as uuidv4 } from "uuid";
import moment from "moment";


export const config = {
  matcher: ["/api/openai", "/api/openai/v1/chat/completions"],
};

const serverConfig = getServerSideConfig();

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

export async function middleware(req: NextRequest) {

  const traceId = uuidv4();
  req.headers.set("traceId", traceId);
  const now = moment().format("YYYY-MM-DD HH:mm:ss.SSS");


  req.json().then((json) => {
    console.log(`[${now}][${req.headers.get("traceId")}}][${getIP(req)}][Req]${JSON.stringify(json.messages)}`);
  });

  return NextResponse.next({
    request: {
      headers: req.headers,
    },
  });
}
