import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "./app/config/server";
import md5 from "spark-md5";
import { v4 as uuidv4 } from "uuid";

export const config = {
  matcher: ["/api/openai", "/api/chat-stream"],
};

const serverConfig = getServerSideConfig();

export async function middleware(req: NextRequest) {

  const traceId = uuidv4();
  req.headers.set("traceId", traceId);

  const json = await req.json();
  console.log(`[${req.headers.get("traceId")}}][Req]${JSON.stringify(json.messages)}`);


  return NextResponse.next({
    request: {
      headers: req.headers,
    },
  });
}
