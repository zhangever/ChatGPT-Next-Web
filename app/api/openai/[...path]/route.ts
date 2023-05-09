import { createParser } from "eventsource-parser";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../auth";
import { requestOpenai } from "../../common";
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

async function logReq(req: NextRequest) {
  const userIp = getIP(req);
  const currentTime = moment().format("YYYY-MM-DD HH:mm:ss");

  const traceId = uuidv4();

  req.headers.set("traceId", traceId);
  if (req.bodyUsed) {
    req.body?.tee();
  }
  // get request body
  const json = await req.json();
  console.log(
    `[${currentTime}][${req.headers.get(
      "traceId",
    )}}][${userIp}][Req]:${JSON.stringify(json.messages)}`,
  );
}

async function createStream(res: Response, req: NextRequest) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const traceId = req.headers.get("traceId");
      let respContent = "";
      logReq(req);

      function onParse(event: any) {
        if (event.type === "event") {
          const data = event.data;
          // https://beta.openai.com/docs/api-reference/completions/create#completions/create-stream
          if (data === "[DONE]") {
            controller.close();
            console.log(`[${traceId}][Res]${respContent}`);
            return;
          }
          try {
            const json = JSON.parse(data);
            const text = json.choices[0].delta.content;
            text && (respContent += text);
            const queue = encoder.encode(text);
            controller.enqueue(queue);
          } catch (e) {
            controller.error(e);
          }
        }
      }

      const parser = createParser(onParse);
      for await (const chunk of res.body as any) {
        parser.feed(decoder.decode(chunk, { stream: true }));
      }
    },
  });
  return stream;
}

function formatResponse(msg: any) {
  const jsonMsg = ["```json\n", JSON.stringify(msg, null, "  "), "\n```"].join(
    "",
  );
  return new Response(jsonMsg);
}

async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  console.log("[OpenAI Route] params ", params);

  const authResult = auth(req);
  if (authResult.error) {
    return NextResponse.json(authResult, {
      status: 401,
    });
  }

  try {
    const api = await requestOpenai(req);

    const contentType = api.headers.get("Content-Type") ?? "";

    // streaming response
    if (contentType.includes("stream")) {
      const stream = await createStream(api, req);
      const res = new Response(stream);
      res.headers.set("Content-Type", contentType);
      return res;
    }

    // try to parse error msg
    try {
      const mayBeErrorBody = await api.json();
      if (mayBeErrorBody.error) {
        console.error("[OpenAI Response] ", mayBeErrorBody);
        return formatResponse(mayBeErrorBody);
      } else {
        const res = new Response(JSON.stringify(mayBeErrorBody));
        res.headers.set("Content-Type", "application/json");
        res.headers.set("Cache-Control", "no-cache");
        return res;
      }
    } catch (e) {
      console.error("[OpenAI Parse] ", e);
      return formatResponse({
        msg: "invalid response from openai server",
        error: e,
      });
    }
  } catch (e) {
    console.error("[OpenAI] ", e);
    return formatResponse(e);
  }
}

export const GET = handle;
export const POST = handle;

export const runtime = "edge";
