import { type OpenAIListModelResponse } from "@/app/client/platforms/openai";
import { getServerSideConfig } from "@/app/config/server";
import { ModelProvider, OpenaiPath } from "@/app/constant";
import { prettyObject } from "@/app/utils/format";
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
  // get request body
  const json = await req.json();
  console.log(
    `[${currentTime}][${req.headers.get(
      "traceId",
    )}}][${userIp}][Req]:${JSON.stringify(json.messages)}`,
  );
}

const ALLOWD_PATH = new Set(Object.values(OpenaiPath));

function getModels(remoteModelRes: OpenAIListModelResponse) {
  const config = getServerSideConfig();

  if (config.disableGPT4) {
    remoteModelRes.data = remoteModelRes.data.filter(
      (m) => !m.id.startsWith("gpt-4"),
    );
  }

  return remoteModelRes;
}

async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  console.log("[OpenAI Route] params ", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const subpath = params.path.join("/");

  if (!ALLOWD_PATH.has(subpath)) {
    console.log("[OpenAI Route] forbidden path ", subpath);
    return NextResponse.json(
      {
        error: true,
        msg: "you are not allowed to request " + subpath,
      },
      {
        status: 403,
      },
    );
  }

  const authResult = auth(req, ModelProvider.GPT);
  if (authResult.error) {
    return NextResponse.json(authResult, {
      status: 401,
    });
  }

  try {
    const response = await requestOpenai(req);

    // list models
    if (subpath === OpenaiPath.ListModelPath && response.status === 200) {
      const resJson = (await response.json()) as OpenAIListModelResponse;
      const availableModels = getModels(resJson);
      return NextResponse.json(availableModels, {
        status: response.status,
      });
    }

    return response;
  } catch (e) {
    console.error("[OpenAI] ", e);
    return NextResponse.json(prettyObject(e));
  }
}

export const GET = handle;
export const POST = handle;

export const runtime = "edge";
export const preferredRegion = [
  "arn1",
  "bom1",
  "cdg1",
  "cle1",
  "cpt1",
  "dub1",
  "fra1",
  "gru1",
  "hnd1",
  "iad1",
  "icn1",
  "kix1",
  "lhr1",
  "pdx1",
  "sfo1",
  "sin1",
  "syd1",
];
