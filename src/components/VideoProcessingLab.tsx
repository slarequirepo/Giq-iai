import React, { useState, useRef, useEffect } from 'react';
import { Play, Video, Scissors, Sparkles, X, Loader2, Download, Eye, Film, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { geminiService } from '../services/geminiService';

interface Frame {
  data: string;
  timestamp: number;
}

export default function VideoProcessingLab({ onClose }: { onClose: () => void }) {
  const [labMode, setLabMode] = useState<'video' | 'animation' | 'movie'>('video');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [animImages, setAnimImages] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [instructions, setInstructions] = useState('Faça uma edição moderna estilo TikTok com cortes rápidos e efeitos de transição.');
  const [aiResult, setAiResult] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [renderedFrames, setRenderedFrames] = useState<string[]>([]);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [isRendering, setIsRendering] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isCapturing, setIsCapturing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Auto-play rendered frames synced with detected BPM or 10fps precision
  useEffect(() => {
    if (renderedFrames.length > 0 && !isRendering) {
      const intervalMs = 100; // 10fps para animação fluida
      const interval = setInterval(() => {
        setCurrentFrameIdx(prev => (prev + 1) % renderedFrames.length);
      }, intervalMs); 
      return () => clearInterval(interval);
    }
  }, [renderedFrames, isRendering]);

  // Sincroniza o frame renderizado atual para o canvas (necessário para exportação)
  useEffect(() => {
    if (renderedFrames.length > 0 && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = renderedFrames[currentFrameIdx];
    }
  }, [renderedFrames, currentFrameIdx]);

  // Função para gravar o Canvas e gerar um arquivo de vídeo
  const exportToVideo = async () => {
    if (renderedFrames.length === 0) return;
    
    setIsCapturing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stream = canvas.captureStream(30); // 30 FPS stream
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9'
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setIsCapturing(false);
      
      // Auto download
      const a = document.createElement('a');
      a.href = url;
      a.download = `render-ai-${Date.now()}.mp4`;
      a.click();
    };

    recorder.start();

    // Toca cada frame uma vez para o recorder capturar
    for (let i = 0; i < renderedFrames.length; i++) {
      setCurrentFrameIdx(i);
      // Aguarda o frame ser desenhado no canvas (useEffect faz isso, mas aqui forçamos a espera)
      await new Promise(resolve => setTimeout(resolve, 150)); 
    }
    
    // Repete mais uma vez para garantir que o vídeo tenha duração mínima e fluidez
    for (let i = 0; i < renderedFrames.length; i++) {
      setCurrentFrameIdx(i);
      await new Promise(resolve => setTimeout(resolve, 150)); 
    }

    recorder.stop();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setFrames([]);
      setAiResult(null);
      setRenderedFrames([]);
    }
  };

  const handleImageBatchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 6);
    const readers = files.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readers).then(results => {
      setAnimImages(results);
      setAiResult(null);
      setRenderedFrames([]);
    });
  };

  const extractFrames = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setIsExtracting(true);
    setFrames([]);
    setRenderedFrames([]);
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    const duration = video.duration;
    // Captura ultra-precisa a cada 100ms (10 frames por segundo)
    const interval = 0.1; 
    const extracted: Frame[] = [];

    for (let t = 0; t < duration; t += interval) {
      video.currentTime = t;
      await new Promise(resolve => {
        const handler = () => {
          video.removeEventListener('seeked', handler);
          resolve(null);
        };
        video.addEventListener('seeked', handler);
      });

      context?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', 0.5);
      extracted.push({ data, timestamp: t });
      setFrames(prev => [...prev, { data, timestamp: t }]);
      if (extracted.length >= 200) break; // Até 20 segundos de análise intensa
    }
    
    setIsExtracting(false);
  };

  const renderVideoEdit = async () => {
    const videoFrames = labMode === 'video' ? frames.map(f => f.data) : [];
    const sourceImages = videoFrames.length > 0 ? videoFrames : animImages;
    
    if (labMode !== 'movie' && sourceImages.length === 0) {
      alert("Carregue um vídeo ou selecione imagens para a base da edit!");
      return;
    }

    setIsRendering(true);
    setRenderedFrames([]);
    setCurrentFrameIdx(0);

    try {
      if (labMode === 'movie') {
        const plan = await geminiService.synthesizeMoviePlan({
          prompt: instructions,
          baseImage: animImages[0]
        });
        
        setAiResult({
          styleTitle: plan.movieTitle,
          colorGrade: plan.cinematicStyle,
          bpmSugerido: 120,
          moodAnalysis: plan.soundTrack,
          audioContext: plan.lighting,
          movieData: plan, // Guardamos para o UI
          frames: plan.frames.map((f: any) => ({
             id: f.id,
             generationPrompt: f.prompt,
             vfx: f.action
          }))
        });

        for (let i = 0; i < plan.frames.length; i++) {
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 5000));
          try {
            const imgUrl = await geminiService.generateThumbnail(
              `${plan.frames[i].prompt}. Frame ${i+1} of a consistent movie. Style: ${plan.cinematicStyle}`
            );
            setRenderedFrames(prev => [...prev, imgUrl]);
          } catch (frameErr: any) {
            if (frameErr.message?.includes('429') || frameErr.message?.includes('LIMITE_COTA')) {
               alert("LIMITE DE COTA: A renderização foi interrompida parcialmente. Aguarde 2 minutos para gerar o restante.");
               break;
            }
            throw frameErr;
          }
        }
      } else if (labMode === 'animation') {
        // Modo Storyboard de Animação (Image to Video)
        const plan = await geminiService.synthesizeImageToVideoPlan({
          baseImage: sourceImages[0],
          prompt: instructions
        });
        
        setAiResult({
          styleTitle: plan.storyTitle,
          colorGrade: plan.visualStyle,
          bpmSugerido: plan.fps * 12,
          moodAnalysis: "Motion Sequence",
          audioContext: "Ambient Animation",
          keyframes: plan.frames.map((f: any) => ({
             frame: f.id,
             action: f.action,
             camera: "Fixed / Dynamic",
             prompt: f.prompt
          }))
        });

        // Renderização dos frames de animação
        const renderLimit = plan.frames.length;
        for (let i = 0; i < renderLimit; i++) {
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 5000));
          
          try {
            const imgUrl = await geminiService.generateThumbnail(
              `${plan.frames[i].prompt}. Concept: ${plan.visualStyle}. Single frame of animation, high consistency.`
            );
            setRenderedFrames(prev => [...prev, imgUrl]);
          } catch (frameErr: any) {
            if (frameErr.message?.includes('429') || frameErr.message?.includes('LIMITE_COTA')) {
               alert("LIMITE DE COTA: Foram gerados " + i + " frames de animação. Aguarde 2 minutos para o restante.");
               break;
            }
            throw frameErr;
          }
        }
      } else {
        // Modo Edit de Vídeo (Estilização de Frames Existentes)
        const plan = await geminiService.synthesizeVideoEdit({
          images: sourceImages,
          extraImages: animImages.length > 0 ? animImages : undefined,
          instructions
        });
        setAiResult(plan);

        const renderLimit = Math.min(plan.frames.length, 10);
        for (let i = 0; i < renderLimit; i++) {
          const framePlan = plan.frames[i];
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 5000));

          try {
            const imgUrl = await geminiService.generateThumbnail(
              `${framePlan.generationPrompt}. Maintain consistency with style: ${plan.colorGrade || ''}`
            );
            setRenderedFrames(prev => [...prev, imgUrl]);
          } catch (frameErr: any) {
            if (frameErr.message?.includes('429') || frameErr.message?.includes('LIMITE_COTA')) {
               alert("LIMITE DE COTA: A edição de vídeo foi pausada. Aguarde 2 minutos para continuar.");
               break;
            }
            throw frameErr;
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      let errorMsg = err.message;
      if (err.message?.includes('429') || err.message?.includes('LIMITE_COTA')) {
        errorMsg = "Cota de IA esgotada. Por favor, aguarde 2 minutos antes da próxima renderização.";
      }
      alert("Erro na Renderização Pro: " + errorMsg);
    } finally {
      setIsRendering(false);
    }
  };

  const processLab = async () => {
    setProcessing(true);
    
    try {
      let resultText = '';
      if (labMode === 'video') {
         if (frames.length === 0) throw new Error("Extraia frames primeiro");
         resultText = await geminiService.processVideoFrames(
          frames.map(f => f.data),
          instructions
        );
      } else {
         if (animImages.length === 0) throw new Error("Selecione imagens primeiro");
         resultText = await geminiService.animateImages(
          animImages,
          instructions
        );
      }
      
      if (!resultText) throw new Error("Sem resposta da IA");
      
      try {
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : resultText);
        setAiResult(parsed);
      } catch (e) {
        setAiResult({ summary: resultText });
      }
      
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Erro no processamento da IA");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 bg-black/80 backdrop-blur-xl"
    >
      <div className="bg-[#1a1a1a] w-full max-w-6xl h-full max-h-[85vh] rounded-[2.5rem] border border-white/10 overflow-hidden flex flex-col shadow-2xl relative">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-3 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 rounded-2xl transition-all z-10"
        >
          <X size={24} />
        </button>

        {/* Header */}
        <div className="p-8 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 rounded-2xl">
              <Film className="text-emerald-500" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white italic tracking-tighter uppercase">AI Studio Pro</h2>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Motor de Edição e Animação v5.0</p>
            </div>
          </div>

          <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5">
            <button 
              onClick={() => {setLabMode('video'); setAiResult(null);}}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${labMode === 'video' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-gray-500 hover:text-white'}`}
            >
              Analyze Video
            </button>
            <button 
              onClick={() => {setLabMode('animation'); setAiResult(null);}}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${labMode === 'animation' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-gray-500 hover:text-white'}`}
            >
              Animate Image
            </button>
            <button 
              onClick={() => {setLabMode('movie'); setAiResult(null);}}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${labMode === 'movie' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-gray-500 hover:text-white'}`}
            >
              AI Movie Gen
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 h-full">
            
            {/* Left Col: Upload & Preview */}
            <div className="space-y-6">
              {renderedFrames.length > 0 ? (
                <div className="space-y-4">
                  <div className="relative rounded-[2rem] overflow-hidden border-4 border-emerald-500/20 bg-black aspect-video flex items-center justify-center shadow-2xl shadow-emerald-500/10">
                    <AnimatePresence mode="wait">
                      <motion.img 
                        key={currentFrameIdx}
                        src={renderedFrames[currentFrameIdx]}
                        initial={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, scale: 0.9, filter: 'brightness(2)' }}
                        transition={{ duration: 0.3 }}
                        className="w-full h-full object-cover"
                      />
                    </AnimatePresence>
                    <div className="absolute top-4 left-4 px-3 py-1 bg-emerald-500 text-black text-[8px] font-black uppercase rounded-lg">
                      AI RENDER ACTIVE
                    </div>
                    <div className="absolute bottom-4 right-4 flex gap-1">
                       {renderedFrames.map((_, i) => (
                         <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentFrameIdx ? 'w-4 bg-emerald-500' : 'bg-white/20'}`} />
                       ))}
                    </div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Preview da Edit Renderizada</p>
                    <button 
                      onClick={() => setRenderedFrames([])}
                      className="text-[10px] font-black text-red-500 uppercase hover:underline"
                    >
                      Voltar ao Editor
                    </button>
                  </div>
                </div>
              ) : labMode === 'video' ? (
                <>
                  {!videoUrl ? (
                    <div className="h-[400px] border-2 border-dashed border-white/5 rounded-[2rem] flex flex-col items-center justify-center gap-4 group hover:border-emerald-500/40 transition-all cursor-pointer relative overflow-hidden">
                      <input 
                        type="file" 
                        accept="video/*" 
                        onChange={handleFileChange}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className="p-6 bg-white/5 rounded-3xl group-hover:bg-emerald-500/10 transition-colors">
                        <Video size={40} className="text-gray-600 group-hover:text-emerald-500 transition-colors" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-black text-white uppercase tracking-widest">Carregar Vídeo</p>
                        <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">Extraia prompts e edições</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="relative rounded-[2rem] overflow-hidden border border-white/10 bg-black aspect-video flex items-center justify-center">
                        <video 
                          ref={videoRef} 
                          src={videoUrl} 
                          className="w-full h-full object-contain" 
                          controls
                        />
                        <canvas ref={canvasRef} className="hidden" width={1280} height={720} />
                      </div>
                      <div className="flex gap-4">
                        <button 
                          onClick={() => {setVideoUrl(null); setVideoFile(null); setFrames([]);}}
                          className="flex-1 py-4 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 font-black text-xs uppercase tracking-widest rounded-2xl transition-all"
                        >
                          Limpar
                        </button>
                        <button 
                          onClick={extractFrames}
                          disabled={isExtracting}
                          className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-widest rounded-2xl transition-all disabled:opacity-50"
                        >
                          {isExtracting ? 'Capturando ' : 'Capturar Frames'}
                        </button>
                      </div>
                    </div>
                  )}

                  {frames.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest px-2">Keyframes Capturados ({frames.length})</p>
                      <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
                        {frames.map((f, i) => (
                          <div key={i} className="min-w-[120px] aspect-video rounded-xl overflow-hidden border border-white/10 group relative">
                            <img src={f.data} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-6">
                  <div 
                    className={`h-[400px] border-2 border-dashed border-white/5 rounded-[2rem] flex flex-col items-center justify-center gap-4 group hover:border-emerald-500/40 transition-all cursor-pointer relative overflow-hidden ${animImages.length > 0 ? 'bg-black/20' : ''}`}
                  >
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple
                      onChange={handleImageBatchChange}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    {animImages.length === 0 ? (
                      <>
                        <div className="p-6 bg-white/5 rounded-3xl group-hover:bg-emerald-500/10 transition-colors">
                          <Eye size={40} className="text-gray-600 group-hover:text-emerald-500 transition-colors" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-black text-white uppercase tracking-widest">Carregar Imagens (Até 6)</p>
                          <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">A IA criará animação por keyframes</p>
                        </div>
                      </>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 p-4 w-full h-full">
                         {animImages.map((img, i) => (
                            <img key={i} src={img} className="w-full h-full object-cover rounded-xl border border-white/10 shadow-lg" />
                         ))}
                         {animImages.length < 6 && (
                            <div className="w-full h-full bg-white/5 border border-dashed border-white/20 rounded-xl flex items-center justify-center">
                               <p className="text-[10px] font-black text-gray-600 uppercase">+{6 - animImages.length}</p>
                            </div>
                         )}
                      </div>
                    )}
                  </div>
                  {animImages.length > 0 && (
                    <button 
                      onClick={() => setAnimImages([])}
                      className="w-full py-4 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 font-black text-xs uppercase tracking-widest rounded-2xl transition-all"
                    >
                      Remover Imagens
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Right Col: AI Controls & Results */}
            <div className="flex flex-col h-full bg-white/[0.02] border border-white/5 rounded-[2rem] p-8 space-y-6">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-emerald-500 tracking-widest block">
                  {labMode === 'video' ? 'Instruções para Edição / Prompt' : labMode === 'movie' ? 'Script para o Filme (10 frames / 0.1s)' : 'Instruções para Animação'}
                </label>
                <textarea 
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder={
                    labMode === 'video' ? "Ex: Dê um preview de como seria um edit estilo Phonk com este vídeo..." :
                    labMode === 'movie' ? "Ex: Um astronauta caminhando em Marte em câmera lenta..." :
                    "Ex: Mova os braços e faça os olhos brilharem..."
                  }
                  className="w-full h-32 bg-white/5 border border-white/10 rounded-2xl p-4 text-sm focus:outline-none focus:border-emerald-500/40 custom-scrollbar resize-none font-medium"
                />
                <button 
                  onClick={renderVideoEdit}
                  disabled={isRendering || processing || (labMode === 'video' ? frames.length === 0 : labMode === 'movie' ? false : animImages.length === 0)}
                  className="w-full py-5 bg-gradient-to-r from-emerald-600 to-blue-500 hover:from-emerald-500 hover:to-blue-400 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-blue-500/20 disabled:opacity-30"
                >
                  {isRendering ? (
                    <div className="flex items-center justify-center gap-2">
                       <Loader2 className="animate-spin" size={18} />
                       RENDERIZANDO FRAME {renderedFrames.length + 1}/{aiResult?.frames?.length || aiResult?.keyframes?.length || 10}...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                       <Video size={18} />
                       GERAR EDIT COMPLETA (RENDER)
                    </div>
                  )}
                </button>

                <button 
                  onClick={processLab}
                  disabled={processing || isRendering || (labMode === 'video' ? frames.length === 0 : animImages.length === 0)}
                  className="w-full py-5 bg-white/5 hover:bg-white/10 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all border border-white/10"
                >
                  {processing ? (
                    <div className="flex items-center justify-center gap-2">
                       <Loader2 className="animate-spin" size={18} />
                       ENGINE PROCESSANDO...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                       <Sparkles size={18} />
                       {labMode === 'video' ? 'GERAR PROMPT E EDIT' : 'GERAR ANIMAÇÃO POR KEYFRAMES'}
                    </div>
                  )}
                </button>
              </div>

                              <AnimatePresence mode="wait">
                  {aiResult ? (
                    <motion.div 
                      key="result"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="space-y-6"
                    >
                      {/* Movie specific result */}
                      {labMode === 'movie' && aiResult?.movieData && (
                        <div className="space-y-6">
                           <div className="p-4 bg-blue-500/20 border border-blue-500/40 rounded-2xl">
                             <div className="flex items-center gap-2 mb-1">
                               <Film size={14} className="text-blue-500" />
                               <h3 className="text-[10px] font-black text-blue-500 tracking-widest uppercase">AI MOVIE: {aiResult.styleTitle}</h3>
                             </div>
                             <p className="text-[10px] text-blue-500/60 font-bold uppercase mt-1">Cinematography: {aiResult.colorGrade}</p>
                           </div>

                           <div className="p-5 bg-white/5 border border-white/10 rounded-3xl">
                            <h3 className="text-[10px] font-black text-gray-500 tracking-widest uppercase mb-3 text-center">Protocolo de Som & Luz</h3>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                                <p className="text-[8px] font-black text-blue-500 uppercase">Soundtrack</p>
                                <p className="text-xs text-white font-bold">{aiResult.moodAnalysis}</p>
                              </div>
                              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                                <p className="text-[8px] font-black text-blue-500 uppercase">Lighting</p>
                                <p className="text-xs text-white font-bold">{aiResult.audioContext}</p>
                              </div>
                            </div>
                           </div>

                           {renderedFrames.length > 0 && !isRendering && (
                            <button
                              onClick={exportToVideo}
                              disabled={isCapturing}
                              className="w-full py-4 bg-emerald-500 text-black font-black uppercase tracking-widest rounded-2xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-2"
                            >
                              <Download size={18} />
                              {isCapturing ? "Convertendo para MP4..." : "Exportar Filme .MP4"}
                            </button>
                           )}

                           <div className="space-y-3">
                              <h3 className="text-[10px] font-black text-blue-500 tracking-widest uppercase px-1">Roteiro de Frame (SFX Mix)</h3>
                              <div className="space-y-2 overflow-y-auto max-h-[300px] custom-scrollbar pr-2">
                                 {aiResult.movieData.frames.map((kf: any, i: number) => (
                                    <div key={i} className="p-3 bg-white/[0.03] rounded-2xl border border-white/5 flex gap-4 items-start">
                                       <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 font-black text-[10px] shrink-0">
                                          #{kf.id}
                                       </div>
                                       <div className="space-y-1 flex-1">
                                          <p className="text-xs font-bold text-white uppercase tracking-widest">{kf.action}</p>
                                          <div className="flex items-center gap-2">
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">SFX: {kf.sfx}</p>
                                          </div>
                                        </div>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        </div>
                      )}

                      {/* Video specific result */}
                      {labMode === 'video' && aiResult?.styleTitle && (
                        <div className="space-y-4">
                          <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl">
                             <div className="flex items-center gap-2 mb-1">
                               <Sparkles size={14} className="text-emerald-500" />
                               <h3 className="text-[10px] font-black text-emerald-500 tracking-widest uppercase">Master Style: {aiResult.styleTitle}</h3>
                             </div>
                             <p className="text-[10px] text-emerald-500/60 font-bold uppercase mt-1">Grade: {aiResult.colorGrade}</p>
                             <p className="text-[10px] text-emerald-500/60 font-bold uppercase">Sync: {aiResult.bpmSugerido} BPM</p>
                          </div>

                          <div className="p-5 bg-white/5 border border-white/10 rounded-3xl">
                            <h3 className="text-[10px] font-black text-gray-500 tracking-widest uppercase mb-2">Protocolo de Produção</h3>
                            <div className="flex gap-4">
                              <div className="flex-1 p-3 bg-white/5 rounded-xl border border-white/5">
                                <p className="text-[8px] font-black text-emerald-500 uppercase">Vibe</p>
                                <p className="text-xs text-white font-bold">{aiResult.moodAnalysis}</p>
                              </div>
                              <div className="flex-1 p-3 bg-white/5 rounded-xl border border-white/5">
                                <p className="text-[8px] font-black text-emerald-500 uppercase">Audio Sync</p>
                                <p className="text-xs text-white font-bold">{aiResult.audioContext}</p>
                              </div>
                            </div>
                          </div>

                          {renderedFrames.length > 0 && !isRendering && (
                            <button
                              onClick={exportToVideo}
                              disabled={isCapturing}
                              className="w-full py-4 bg-emerald-500 text-black font-black uppercase tracking-widest rounded-2xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:opacity-50"
                            >
                              <Download size={18} />
                              {isCapturing ? "Gravando Vídeo..." : "Exportar como MP4"}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Animation specific result */}
                      {labMode === 'animation' && (
                        <div className="space-y-6">
                          <div className="p-5 bg-white/5 rounded-3xl border border-white/10">
                            <h3 className="text-[10px] font-black text-emerald-500 tracking-widest uppercase mb-2">Análise de Rigging</h3>
                            <p className="text-sm text-gray-400 font-medium">{aiResult.characterAnalysis || aiResult.moodAnalysis}</p>
                          </div>
                          
                          {renderedFrames.length > 0 && !isRendering && (
                            <button
                              onClick={exportToVideo}
                              disabled={isCapturing}
                              className="w-full py-4 bg-emerald-500 text-black font-black uppercase tracking-widest rounded-2xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:opacity-50"
                            >
                              <Download size={18} />
                              {isCapturing ? "Gravando Vídeo..." : "Exportar como MP4"}
                            </button>
                          )}

                          <div className="space-y-3">
                             <h3 className="text-[10px] font-black text-emerald-500 tracking-widest uppercase px-1">Sequência de Keyframes de Movimento</h3>
                             <div className="space-y-2">
                                {aiResult.keyframes?.map((kf: any, i: number) => (
                                   <div key={i} className="p-3 bg-white/[0.03] rounded-2xl border border-white/5 flex gap-4 items-start">
                                      <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-black text-[10px]">
                                         #{kf.frame}
                                      </div>
                                      <div className="space-y-1 flex-1">
                                         <p className="text-xs font-bold text-white uppercase tracking-widest">Ação: {kf.action}</p>
                                         <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Camera: {kf.camera}</p>
                                      </div>
                                   </div>
                                ))}
                             </div>
                          </div>
                        </div>
                      )}

                      {!aiResult.keyframes && (
                        <div className="p-5 bg-white/5 rounded-3xl border border-white/10">
                          <h3 className="text-[10px] font-black text-emerald-500 tracking-widest uppercase mb-3">Relatório Técnico</h3>
                          <p className="text-sm text-gray-300 leading-relaxed font-medium">
                            {typeof (aiResult.summary || aiResult) === 'object' 
                              ? JSON.stringify(aiResult.summary || aiResult) 
                              : (aiResult.summary || aiResult)}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-30 px-10">
                       <Scissors size={40} className="mb-4" />
                       <p className="text-xs font-bold uppercase tracking-widest">Aguardando Brainstorm de IA</p>
                       <p className="text-[10px] font-medium mt-2">Combine visual e texto para produzir resultados profissionais.</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>

          </div>

        {/* Footer Info */}
        <div className="p-6 bg-black/40 border-t border-white/5 flex justify-between items-center px-10">
          <div className="flex items-center gap-4">
             <div className="flex -space-x-2">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-[#1a1a1a] bg-[#222] flex items-center justify-center">
                    <Sparkles size={12} className="text-emerald-500" />
                  </div>
                ))}
             </div>
             <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Processador Multi-Modal Estendido v5.0</p>
          </div>
          <button 
            disabled={!aiResult}
            className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-gray-200 text-black rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-20"
          >
            <Download size={16} />
            Exportar Protocolo de Produção
          </button>
        </div>

      </div>
    </motion.div>
  );
}
