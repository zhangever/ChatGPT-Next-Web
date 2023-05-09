import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "./app/config/server";
import md5 from "spark-md5";
import { v4 as uuidv4 } from "uuid";

export const config = {
  matcher: ["/api/openai", "/api/chat-stream"],
};

const serverConfig = getServerSideConfig();

function getIP(req: NextRequest) {
  let ip = req.ip ?? req.headers.get("x-real-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");

  if (!ip && forwardedFor) {
    ip = forwardedFor.split(",").at(0) ?? "";
  }

  return ip;
}

export async function middleware(req: NextRequest) {

  const traceId = uuidv4();
  req.headers.set("traceId", traceId);


  const json = await req.json();
  console.log(`[${req.headers.get("traceId")}}][${getIP(req)}][Req]${JSON.stringify(json.messages)}`);


  return NextResponse.next({
    request: {
      headers: req.headers,
    },
  });
}
