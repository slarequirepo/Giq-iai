import { GoogleGenAI } from "@google/genai";

// Inicialização segura - process.env.GEMINI_API_KEY é injetado pelo ambiente
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const geminiService = {
  /**
   * Chat Streaming com suporte a histórico e persona
   */
  async *chatStream(params: {
    prompt: string,
    history: any[],
    persona: string,
    language: string,
    deepSearch?: boolean
  }) {
    const { prompt, history, persona, language, deepSearch } = params;

    const systemInstruction = `Você é o sistema de IA operando sob o perfil: ${persona}.
    SUA ESPECIALIDADE SUPREMA É DESIGN DE THUMBNAILS E ARTES PARA JOGOS MODERNOS.
    IDIOMA DE RESPOSTA PRIORITÁRIO: ${language}.
    ESTILO DE RESPOSTA ATUAL: ${persona.toUpperCase()}.
    DEEP SEARCH ATIVADO: ${deepSearch ? 'SIM' : 'NÃO'}.
    
    DIRETRIZES:
    1. Respostas em Markdown de nível editorial.
    2. Profundidade Técnica em Composição Visual e Design.
    3. Se o usuário pedir uma thumbnail, forneça dicas de layout além de gerar a imagem.
    4. SEJA DIRETO E CONCISO.
    5. Use gírias de designer/gamer quando apropriado.`;

    const stream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: [
        ...history.map(h => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.content || '' }]
        })),
        { role: 'user', parts: [{ text: prompt }] }
      ],
      config: {
        systemInstruction,
      }
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  },

  /**
   * Geração de Imagem (Thumbnail Mastery) com Retry para Quota
   */
  async generateThumbnail(prompt: string, retries = 3): Promise<string> {
    let enhancedPrompt = prompt;
    if (prompt.toLowerCase().includes('thumb') || prompt.toLowerCase().includes('miniatura')) {
      enhancedPrompt = `PROFESSIONAL HIGH-PERFORMANCE YOUTUBE THUMBNAIL, ${prompt}, extremely high contrast, vibrant saturated colors, dynamic action composition, cinematic lighting, ultra-detailed, 8k resolution, modern gaming style.`;
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ role: 'user', parts: [{ text: enhancedPrompt }] }],
        config: {
          imageConfig: {
            aspectRatio: "16:9",
          }
        }
      });

      const imagePart = response.candidates?.[0]?.content.parts.find((part: any) => part.inlineData);
      
      if (imagePart) {
        return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
      }
      
      throw new Error("O modelo não retornou dados de imagem.");
    } catch (err: any) {
      const isQuotaError = err.message?.includes('429') || JSON.stringify(err).includes('429');
      
      if (isQuotaError && retries > 0) {
        // Aumentando o delay para 10s base no retry para garantir liberação da cota RPM
        const delay = (4 - retries) * 10000; 
        console.warn(`Quota 429 detectada. Tentando novamente em ${delay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.generateThumbnail(prompt, retries - 1);
      }
      
      if (isQuotaError) {
        throw new Error("LIMITE_COTA_EXCEDIDO: A cota de geração de imagens da IA foi atingida. Por favor, aguarde de 1 a 2 minutos antes de tentar novamente.");
      }
      
      throw err;
    }
  },

  /**
   * Processamento de Vídeo (Análise de Frames)
   */
  async processVideoFrames(frames: string[], instructions: string) {
    const promptData = `Analise estes quadros de um vídeo e aplique o seguinte pedido de edição: ${instructions}.
    
    RETORNE UMA ESTRUTURA JSON (apenas o JSON) com:
    1. "summary": Resumo do que acontece no vídeo.
    2. "editTimeline": Uma lista de efeitos/cortes sugeridos.
    3. "aiInsight": Uma análise técnica de como melhorar a estética.
    4. "stylePreset": Um nome de estilo para aplicar.
    5. "generatedPrompt": Um prompt otimizado baseado neste vídeo para gerar algo similar ou novo.`;

    const contentsParts = [
      { text: promptData },
      ...frames.map((b64) => {
        const mimeType = b64.match(/data:([^;]+);base64/)?.[1] || "image/jpeg";
        const data = b64.replace(/^data:image\/[^;]+;base64,/, "");
        return { inlineData: { data, mimeType } };
      })
    ];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: contentsParts }]
    });

    return response.text;
  },

  /**
   * Animação de Imagem (Image to Video Keyframes)
   */
  async animateImages(images: string[], instructions: string) {
    const promptData = `Você é um diretor de animação e especialista em rigging de personagens.
    Analise estas imagens (${images.length} imagens fornecidas).
    
    MISSÃO: Gerar uma sequência de 10 keyframes de animação baseada nestas imagens e nas instruções: ${instructions}.
    
    SE FOR UM PERSONAGEM:
    - Identifique partes do corpo (cabeça, braços, pernas, tronco).
    - Descreva o movimento de cada parte frame a frame.
    
    RETORNE APENAS JSON:
    {
      "characterAnalysis": "Análise da estrutura detectada",
      "keyframes": [
        { "frame": 1, "action": "Descrição detalhada do movimento e rigging", "camera": "Ângulo sugerido" },
        ... (total 10)
      ],
      "vfxSuggestions": ["Efeitos recomendados"],
      "loopingInfo": "Como fazer o vídeo dar loop perfeito"
    }`;

    const contentsParts = [
      { text: promptData },
      ...images.map((b64) => {
        const mimeType = b64.match(/data:([^;]+);base64/)?.[1] || "image/jpeg";
        const data = b64.replace(/^data:image\/[^;]+;base64,/, "");
        return { inlineData: { data, mimeType } };
      })
    ];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts: contentsParts }]
    });

    return response.text;
  },

  /**
   * Síntese de Edit Profissional (Gera os Prompts para os Frames da Edit)
   * Integra imagens extras se fornecidas para criar transições ricas.
   */
  async synthesizeVideoEdit(params: { images: string[], instructions: string, extraImages?: string[] }) {
    const prompt = `Você é um Diretor de VFX de Edição Viral (Style: AMV / Phonk / Velocity).
    
    MISSÃO: Gerar um Master Render Plan de 1 segundo (10 keyframes) com precisão de 0.1s.
    
    ENTRADAS:
    - Frames do vídeo original (Base de movimento).
    - Imagens extras/referência (Estética/Impacto).
    
    ESTILO SOLICITADO: "${params.instructions}".
    
    DIRETRIZES DE RENDERIZAÇÃO:
    1. CONCORDÂNCIA TEMPORAL: O frame N deve fluir para o N+1.
    2. IMPACTO VISUAL: Use as imagens extras como "Glitch Overlays" ou "Style Injections".
    3. QUALIDADE: Prompts em inglês para High-End Render (8k, unreal engine 5 style, volumetric lighting, motion blur).
    
    RETORNE APENAS JSON:
    {
      "styleTitle": "Nome da Trend",
      "bpmSugerido": 150,
      "colorGrade": "Descrição da paleta",
      "frames": [
        { 
          "id": 1, 
          "generationPrompt": "Detailed English prompt for frame 1 (0.1s)", 
          "vfx": "Ex: Zoom blur",
          "lyric": "Beat 1"
        },
        ... (gere 10 frames)
      ]
    }`;

    // Limitamos o número de imagens enviadas para não estourar o contexto da IA
    const combinedImages = [
      ...params.images.slice(0, 10), 
      ...(params.extraImages || []).slice(0, 5)
    ];

    const parts = [
      { text: prompt },
      ...combinedImages.map(img => {
        const data = img.replace(/^data:image\/[^;]+;base64,/, "");
        const mimeType = img.match(/data:([^;]+);base64/)?.[1] || "image/jpeg";
        return { inlineData: { data, mimeType } };
      })
    ];

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: 'user', parts }]
    });

    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
    } catch (e) {
      throw new Error("Falha ao sintetizar plano de renderização profissional.");
    }
  },

  /**
   * Planeja uma sequência de movimento a partir de uma entrada (imagem ou prompt)
   */
  async synthesizeImageToVideoPlan(params: { baseImage?: string, prompt: string, frameCount?: number, fps?: number, stylePreset?: string }) {
    const frameCount = params.frameCount || 8;
    const fps = params.fps || 10;
    const style = params.stylePreset || "Cinematic 3D Animation";

    const prompt = `Você é um Animador de Storyboard e Diretor de Fotografia AI Especialista.
    
    MISSÃO: Criar um roteiro coerente de ${frameCount} frames sequenciais para um vídeo em ${fps} FPS.
    TEMA/PROMPT: "${params.prompt}".
    ESTILO VISUAL: "${style}".
    
    REGRAS CRÍTICAS DE CONSISTÊNCIA TEMPORAL (FRAME-BY-FRAME):
    1. MESMO PERSONAGEM/CENÁRIO: Mantenha cores, roupas, iluminação e geometria idênticas em todos os frames.
    2. DELTA DE MOVIMENTO: Cada frame deve ser uma progressão suave de 1/${fps} segundos do frame anterior.
    3. PROMPTS EM INGLÊS: Cada prompt deve ser rico em detalhes fotográficos (ex: "8k, high consistency, volumetric light, shot on 35mm lens, master piece").
    4. SOUND DESIGN: Defina o efeito sonoro (sfx) e nota musical para cada frame.
    
    RETORNE APENAS JSON VÁLIDO:
    {
      "storyTitle": "Título do Vídeo",
      "visualStyle": "${style}",
      "fps": ${fps},
      "soundTheme": "cinematic",
      "soundTrack": "Descrição da vibe musical",
      "frames": [
        { 
          "id": 1, 
          "prompt": "Highly detailed English prompt with style keywords", 
          "action": "Descrição da ação em português",
          "camera": "Zoom in / Pan / Static",
          "sfx": "whoosh / impact / chime / riser / laser"
        }
      ]
    }`;

    const parts: any[] = [{ text: prompt }];

    if (params.baseImage) {
      const data = params.baseImage.replace(/^data:image\/[^;]+;base64,/, "");
      const mimeType = params.baseImage.match(/data:([^;]+);base64/)?.[1] || "image/jpeg";
      parts.push({ inlineData: { data, mimeType } });
    }

    try {
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts }]
      });
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
    } catch (e) {
      throw new Error("Erro ao criar roteiro de animação.");
    }
  },

  /**
   * Planeja um filme completo com roteiro de imagem e som
   */
  async synthesizeMoviePlan(params: { prompt: string, baseImage?: string, frameCount?: number, fps?: number, stylePreset?: string }) {
    const frameCount = params.frameCount || 10;
    const fps = params.fps || 10;
    const style = params.stylePreset || "Cinematic Masterpiece 8k";

    const prompt = `Você é um Diretor de Cinema AI Especialista em Vídeos Gerados por IA (Sora / Kling / Runway Style).
    
    MISSÃO: Criar um Master Script sequencial para um clipe de ${frameCount} frames a ${fps} FPS.
    TEMA: "${params.prompt}".
    ESTILO VISUAL: "${style}".
    
    DIRETRIZES TÉCNICAS:
    1. CONSISTÊNCIA ABSOLUTA: Mesma paleta de cores, mesma luz e mesmo sujeito com pequenas variações de ângulo/pose a cada frame.
    2. CONTINUIDADE TEMPORAL: Cada frame (frame duration: ${(1/fps).toFixed(2)}s) deve conectar com naturalidade ao próximo.
    3. SOUND DESIGN SINCRONIZADO: Descreva a trilha musical global e o efeito sonoro de cada batida.
    
    RETORNE APENAS JSON VÁLIDO:
    {
      "movieTitle": "Nome do Curta",
      "cinematicStyle": "${style}",
      "fps": ${fps},
      "soundTheme": "cyberpunk", 
      "lighting": "Volumetric dramatic lighting",
      "soundTrack": "Heavy synth bass with ambient atmospheric pads",
      "frames": [
        { 
          "id": 1, 
          "prompt": "Ultra realistic 8k rendering of [subject], consistent lighting, Unreal Engine 5, cinematic depth of field", 
          "action": "Descrição do movimento da cena", 
          "sfx": "impact / whoosh / riser / laser / chime" 
        }
      ]
    }`;

    const parts: any[] = [{ text: prompt }];
    if (params.baseImage) {
      const data = params.baseImage.replace(/^data:image\/[^;]+;base64,/, "");
      const mimeType = params.baseImage.match(/data:([^;]+);base64/)?.[1] || "image/jpeg";
      parts.push({ inlineData: { data, mimeType } });
    }

    try {
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts }]
      });
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
    } catch (e) {
      throw new Error("Erro ao roteirizar filme.");
    }
  }
};
