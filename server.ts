import { GoogleGenAI, Type } from "@google/genai";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// API endpoint for AI receipt parsing
app.post("/api/gemini/parse-receipt", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "No image provided" });
    }

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: [
        {
          inlineData: {
            mimeType: mimeType || "image/jpeg",
            data: imageBase64,
          }
        },
        {
          text: "請分析這張收據或發票圖片，並萃取以下欄位以 JSON 格式回傳：\n1. date (日期，格式 YYYY-MM-DD，若無法辨識則給今天)\n2. vendor (商店/商家名稱)\n3. invoiceNo (發票號碼，如 AB12345678 或發票上的字軌號碼)\n4. description (品項或摘要說明)\n5. amount (金額，純數字)\n6. category (建議分類，只能是以下之一：辦公文具、差旅交通、餐飲招待、郵電快遞、雜支、設備維修)"
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            vendor: { type: Type.STRING },
            invoiceNo: { type: Type.STRING },
            description: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            category: { type: Type.STRING }
          },
          required: ["date", "description", "amount", "category"]
        }
      }
    });

    const resultJson = JSON.parse(response.text || "{}");
    res.json(resultJson);
  } catch (error: any) {
    console.error("AI receipt parse error:", error);
    res.status(500).json({ error: error.message || "Failed to parse receipt with AI" });
  }
});

// API endpoint for AI financial advisor / spending analysis
app.post("/api/gemini/analyze-ledger", async (req, res) => {
  try {
    const { transactions, budget, currentBalance } = req.body;
    
    const prompt = `你是一位專業的企業財務長與會計顧問。請針對以下部門零用金明細進行財務分析與建議：
目前零用金總額/預算：${budget}
當前餘額：${currentBalance}
交易記錄：${JSON.stringify(transactions.slice(-30))}

請用繁體中文給出 3 點專業的財務控管建議、異常支出提醒或優化方向，格式為 JSON 陣列，每點包含 title 與 suggestion。`;

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              suggestion: { type: Type.STRING }
            },
            required: ["title", "suggestion"]
          }
        }
      }
    });

    const suggestions = JSON.parse(response.text || "[]");
    res.json({ suggestions });
  } catch (error: any) {
    console.error("AI ledger analysis error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze ledger" });
  }
});

// Vite middleware setup
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
