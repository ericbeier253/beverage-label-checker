import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { AzureOpenAI } from 'openai';
import { checkAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const contextString = formData.get('context') as string || "[]";

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const uploadDir = path.join(process.cwd(), 'public/uploads');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, file.name);
    fs.writeFileSync(filePath, buffer);

    // Initialize Azure OpenAI client
    // Credentials are automatically loaded from .env.local
    const client = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      apiVersion: "2024-02-01",
      deployment: "gpt-5.4",
    });

    const base64Image = buffer.toString('base64');
    let mimeType = file.type || 'image/jpeg';
    if (mimeType === 'application/octet-stream') {
      if (file.name.endsWith('.png')) mimeType = 'image/png';
      else if (file.name.endsWith('.webp')) mimeType = 'image/webp';
      else mimeType = 'image/jpeg';
    }

    const systemPrompt = `You are an AI assistant for the TTB (Alcohol and Tobacco Tax and Trade Bureau). 
Your job is to extract data from alcohol labels.
We are processing a batch of sequentially uploaded images. I will provide you with a 'context' array representing bottles we have already discovered in this batch.

CRITICAL EXTRACTION RULES:
1. ALWAYS begin the 'description' field with the exact orientation of the label (e.g., "[Front Label]:", "[Back Label]:", "[Side LabeL]:" "[Top Cap/Seal]:"). Note that a screw cap or neck sleeve is a 'top' or 'neck' label, not a back label. If a label is not wholly visible in the frame, ignore it.
2. STRICT OCR WARNING: For the 'governmentWarning', you must act as a strict OCR engine. Transcribe the text EXACTLY character-for-character as printed. Do NOT auto-complete, infer missing words, or fix typos.
3. Be extremely careful parsing Net Contents. Slashes are often misread as the number 7 (e.g. "80/1.75 LITERS" being misread as "807 75 LITERS"). If you find data preceding or following the liters (e.g. 80/1.75 L), only the volume (1.75 L) should be recorded in the netContents field If you see numbers mashed together, look closely at the image. Extract only the true volume (e.g. "1.75 L"). Volumes over 3 Liters are exceedingly rare and usually a misread. DO NOT default to or assume "750 ML" unless explicitly printed. 

CRITICAL MATCHING RULES:
1. Back labels often lack brand names. You MUST rely heavily on physical and visual context clues (e.g., bottle shape, glass clarity, liquid color like amber/clear, label colors) matching the descriptions in the context array to make a positive ID. 
2. If the visual characteristics strongly match a context item, assume they are the same bottle.
3. DEDUCTIVE REASONING & COMPLETENESS: Images are probably uploaded sequentially. When deciding whether to merge a back/side label with an existing context item, evaluate these checks IN ORDER:
   - CHECK 1 (Orientation Check): If the current image is clearly a FRONT label, and the context item already has a FRONT label, DO NOT merge them. They are likely two distinct bottles. Create a new unique_key.
   - CHECK 2 (Visual Match): Does the liquid color, bottle shape, and glass clarity roughly match the context item? If no, DO NOT merge.
   - CHECK 3 (Gap Filling Priority): The primary goal of merging is to complete a bottle's data profile. Does the current image provide data (like a Government Warning, net contents, or class type) that a context item is currently MISSING? If yes, and it passed Checks 1 & 2, MERGE THEM by using the exact unique_key from the context item.
   - CHECK 4 (Completeness Flag Check): Each context item has an 'isComplete' flag. If 'isComplete' is true, the context bottle already has its core fields (brand, class, abv, contents, warning). While it's not impossible to have a duplicate label, it is highly unlikely that a new back label matches a bottle that is already complete. Strongly prefer merging with context items where 'isComplete' is false.
   - CHECK 5 (Duplicate Data is Okay): It is normal for front and back labels to duplicate data (like brand names or volume). Do not disqualify a merge just because data overlaps. However, if you are choosing between multiple visually similar context items, strongly prefer merging with the one where this image fills a data gap.
6. Only if the bottle fails the above checks and is completely distinct from the context should you invent a new, descriptive 'unique_key' (e.g., 'jackdaniels_whiskey_750ml').

Return ONLY a valid JSON object with the following keys, and NO markdown formatting or conversational text:
{
  "unique_key": "the matched key from context, or a newly generated key",
  "description": "[Orientation Prefix]: a highly detailed visual description of the bottle, liquid color, and label design",
  "brandName": "exact text if found, else empty string",
  "classType": "exact text if found, else empty string",
  "alcvol": "numeric value if found, else NaN",
  "proof": "numeric value if found, else NaN",
  "netContents": "exact text if found, else empty string",
  "governmentWarning": "exact text if found, else empty string"
}

Context (previously discovered bottles):
${contextString}`;

    console.log(`Calling Azure OpenAI GPT-5.4...`);

    const response = await client.chat.completions.create({
      model: "gpt-5.4",
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please extract the text from this label and output strictly JSON."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ]
    });

    const extractedText = response.choices[0].message.content || "{}";
    const extractedData = JSON.parse(extractedText);

    // Derive Proof or ABV if one is NaN
    let alc = Number(extractedData.alcvol);
    let prf = Number(extractedData.proof);

    if (isNaN(alc) && !isNaN(prf)) {
      alc = prf / 2;
    } else if (isNaN(prf) && !isNaN(alc)) {
      prf = alc * 2;
    }

    extractedData.alcvol = isNaN(alc) ? "NaN" : alc;
    extractedData.proof = isNaN(prf) ? "NaN" : prf;

    return NextResponse.json({
      success: true,
      extracted: extractedData,
      imageUrl: `/uploads/${file.name}`
    });

  } catch (error: any) {
    console.error('Extraction error:', error);
    return NextResponse.json({
      error: 'Azure OpenAI Extraction failed',
      details: { error: { message: error.message } }
    }, { status: 500 });
  }
}
