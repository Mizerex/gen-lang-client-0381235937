import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { PostData, Trend } from "../types";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const cleanText = (raw: string): string => {
  let cleaned = raw.replace(/\(\d{0,2}:\d{2}\)/g, "");
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  // Remove the hardcoded question to avoid duplicates.
  cleaned += "\n\nNão se esqueça do triplo C — curta, comenta e compartilha!";
  return cleaned;
};

const postSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "Um título curto e chamativo (máximo 8 palavras).",
    },
    question: {
      type: Type.STRING,
      description: "Uma pergunta final para engajamento.",
    },
    hashtags: {
      type: Type.ARRAY,
      description: "Cinco hashtags de alto alcance, misturando gerais e do nicho especificado.",
      items: { type: Type.STRING },
    },
  },
  required: ["title", "question", "hashtags"],
};

export const generatePostDetails = async (rawText: string): Promise<PostData> => {
  const cleanedText = cleanText(rawText);
  const niche = "animes, cultura pop, filmes e séries";
  
  const userPrompt = `
    Gere os seguintes itens para um vídeo de TikTok baseado no texto abaixo:
    1) Um título curto e chamativo (máx 8 palavras)
    2) Uma pergunta final para engajamento
    3) Cinco hashtags de alto alcance (misturando gerais e do nicho ${niche})
    
    Texto base: """${cleanedText}"""
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: "Você é um especialista em criar legendas e títulos virais para o TikTok em português.",
        responseMimeType: "application/json",
        responseSchema: postSchema,
        temperature: 0.5,
      },
    });

    const llmResponse = JSON.parse(response.text);
    return {
      cleanedText,
      title: llmResponse.title,
      question: llmResponse.question,
      hashtags: llmResponse.hashtags,
    };
  } catch (error) {
    console.error("Error generating post details with Gemini:", error);
    // Fallback in case of API error
    return {
      cleanedText,
      title: "Descubra algo surpreendente",
      question: "O que você acha disso?",
      hashtags: ["#foryou", "#anime", "#viral", "#triploC", "#curiosidades"],
    };
  }
};


export const generateSpeech = async (script: string, voiceName: string = 'Kore'): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: script }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voiceName }, 
                },
            },
        },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
        return base64Audio;
    }
    return null;
  } catch (error) {
    console.error("Error generating speech with Gemini:", error);
    return null;
  }
};

export const generateScriptFromTrend = async (trend: Trend): Promise<string> => {
  const prompt = `
    Aja como um roteirista especialista em criar conteúdo viral para o TikTok.
    Sua tarefa é criar um roteiro completo para um vídeo curto (narração em off). O texto final deve ser dimensionado para ter uma duração de narração entre 50 e 60 segundos.

    O tema do vídeo é a seguinte tendência:
    - Tópico: "${trend.topic}"
    - Descrição: "${trend.desc}"

    O roteiro deve ser cativante, começar com um gancho forte para prender a atenção nos primeiros 3 segundos, desenvolver a ideia principal de forma clara e terminar com uma chamada para ação (CTA) forte, incentivando o engajamento.
    
    IMPORTANTE: O resultado final deve ser APENAS o texto do roteiro, limpo e pronto para ser narrado. Não inclua NENHUMA indicação de cena, nome de locutor, timecodes, ou anotações como "(Pausa breve)".
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.7,
      },
    });
    return response.text;
  } catch (error) {
    console.error("Error generating script from trend:", error);
    throw new Error("Não foi possível gerar o roteiro a partir da tendência.");
  }
};

const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

export const transcribeVideo = async (videoFile: File): Promise<string> => {
    const videoPart = await fileToGenerativePart(videoFile);
    const prompt = "Transcreva com precisão o áudio deste vídeo. Retorne apenas o texto falado, em português, sem comentários adicionais.";

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: { parts: [ { text: prompt }, videoPart ] },
        });
        return response.text;
    } catch (error) {
        console.error("Error transcribing video:", error);
        throw new Error("Não foi possível transcrever o vídeo.");
    }
};