/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Part } from "@google/genai";
import Markdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { shadesOfPurple } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Send, 
  Plus,
  Settings,
  Menu,
  X,
  Zap,
  Paperclip,
  Sparkles,
  User,
  MessageSquare,
  ChevronRight,
  MoreHorizontal,
  CircleHelp,
  LogOut,
  Files as FileIcon,
  Globe,
  MoreVertical,
  Trash2,
  Share
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Message {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  files?: { name: string, type: string }[];
}

interface FileUpload {
  file: File;
  preview: string;
}

export default function App() {
  const aiName = "React AI";
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: `Olá! Eu sou o ${aiName}. Como posso ajudar você hoje?`, id: 'initial' }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [files, setFiles] = useState<FileUpload[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if ((!userInput.trim() && files.length === 0) || isGenerating) return;

    const userMessage: Message = { 
      role: 'user', 
      content: userInput, 
      id: Date.now().toString(),
      files: files.map(f => ({ name: f.file.name, type: f.file.type }))
    };

    setMessages(prev => [...prev, userMessage]);
    setUserInput('');
    setIsGenerating(true);

    try {
      // Build History for memory
      const history = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const parts: Part[] = [{ text: userInput }];

      for (const f of files) {
        const base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(f.file);
        });
        parts.push({
          inlineData: {
            mimeType: f.file.type,
            data: base64Data
          }
        });
      }

      setFiles([]);

      let systemPrompt = `Você é o ${aiName}, um assistente ultra-inteligente focado em programação e lógica, baseado na arquitetura Claude 3.5 Opus / React Elite.
      Sua missão é ser o parceiro mais capaz e útil possível.
      DIRETRIZES:
      1. Use Markdown impecável.
      2. Mantenha o contexto das mensagens anteriores (memória).
      3. Seja técnico, preciso e direto.
      4. Se o usuário pedir para gerar imagem, descreva detalhadamente a cena.
      5. Você agora utiliza o modelo topo de linha para raciocínio complexo.`;
      
      const modelToUse = "gemini-1.5-pro-latest";

      const result = await ai.models.generateContent({
        model: modelToUse,
        contents: [...history, { role: 'user', parts }],
        config: { 
          systemInstruction: systemPrompt,
          temperature: 0.7,
        }
      });

      let responseText = result.text || "Ops, não consegui processar isso agora.";
      let generatedImageBase64 = "";
      
      for (const part of result.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          generatedImageBase64 = part.inlineData.data;
          break;
        }
      }

      if (generatedImageBase64) {
        responseText += `\n\n![Imagem Gerada](data:image/png;base64,${generatedImageBase64})`;
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: responseText, 
        id: (Date.now() + 1).toString() 
      }]);

    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Houve um erro técnico. Por favor, tente novamente em alguns segundos.", 
        id: Date.now().toString() 
      }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const startNewChat = () => {
    setMessages([{ role: 'assistant', content: `Olá! Eu sou o ${aiName}. Como posso ajudar você hoje?`, id: 'initial' }]);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-screen w-full bg-[#212121] text-[#ececec] font-sans overflow-hidden">
      {/* Sidebar Overlay for Mobile/Desktop overlapping */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 z-40 md:bg-black/20"
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ 
          x: isSidebarOpen ? 0 : -260,
          width: 260 
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="bg-[#171717] h-full flex flex-col border-r border-white/10 fixed left-0 top-0 z-50 overflow-hidden shadow-2xl"
      >
        <div className="p-3 flex items-center justify-between mt-2">
           <button 
             onClick={startNewChat}
             className="flex-1 flex items-center gap-3 px-3 py-3 text-sm font-medium hover:bg-[#2c2c2c] rounded-lg transition-colors border border-white/10 group mr-2"
           >
              <Plus size={16} />
              Novo Chat
           </button>
           <button 
             onClick={() => setIsSidebarOpen(false)}
             className="p-3 hover:bg-white/5 rounded-lg text-gray-500"
           >
             <X size={20} />
           </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
          <div className="text-[10px] uppercase text-gray-500 font-bold px-3 py-2">Histórico</div>
          <div className="px-3 py-3 text-sm text-gray-300 hover:bg-[#2c2c2c] rounded-lg truncate cursor-pointer flex items-center justify-between group">
            <div className="flex items-center gap-3 truncate">
              <MessageSquare size={14} className="text-gray-500" />
              Sessão Atual
            </div>
            <MoreHorizontal size={14} className="opacity-0 group-hover:opacity-100 text-gray-500" />
          </div>
        </div>

        <div className="p-3 space-y-1 mb-2">
          <button 
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-3 px-3 py-3 text-sm font-medium hover:bg-[#2c2c2c] rounded-lg transition-colors text-gray-400 hover:text-white"
          >
            <Settings size={16} />
            Configurações
          </button>
          
          <div className="flex items-center gap-3 p-3 hover:bg-[#2c2c2c] rounded-xl cursor-pointer transition-colors mt-4">
            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-xs font-bold text-black shadow-lg">
              U
            </div>
            <div className="flex-1 text-sm font-bold tracking-tight">Usuário Pro</div>
            <ChevronRight size={14} className="text-gray-600" />
          </div>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-[#212121] relative min-w-0">
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-4 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            {!isSidebarOpen && (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 hover:bg-[#2c2c2c] rounded-lg text-gray-400"
              >
                <Menu size={20} />
              </button>
            )}
            <div className="flex items-center gap-2 font-black text-xl text-white tracking-tighter italic">
              {aiName} <span className="not-italic text-[10px] bg-white px-2 py-0.5 rounded-full font-bold text-black ml-1">PLATINUM</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-[#2c2c2c] rounded-lg text-gray-400 group relative">
               <Share size={18} />
               <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Compartilhar</span>
            </button>
          </div>
        </header>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto px-4 md:px-0 pt-6 pb-48 scroll-smooth scrollbar-thin scrollbar-thumb-gray-800">
          <div className="max-w-3xl mx-auto w-full space-y-12">
            <AnimatePresence>
              {messages.map((msg, index) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index === messages.length - 1 ? 0.2 : 0 }}
                  className={`flex gap-4 md:gap-6 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 animate-pulse-slow shadow-lg shadow-white/10 border border-white/10">
                      <Sparkles size={18} className="text-black" />
                    </div>
                  )}

                  <div className={`max-w-[100%] leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-[#2f2f2f] text-white px-5 py-4 rounded-[24px] shadow-sm ml-auto border border-white/5' 
                      : 'bg-transparent text-gray-100 flex-1'
                  }`}>
                    {msg.role === 'assistant' && (
                      <div className="font-black text-[10px] uppercase tracking-widest text-white mb-2 opacity-80">
                        {aiName}
                      </div>
                    )}
                    
                    {msg.files && msg.files.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {msg.files.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl text-xs border border-white/10 shadow-sm">
                            <FileIcon size={14} className="text-blue-400" />
                            {f.name}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="markdown-body prose prose-invert prose-p:leading-relaxed prose-pre:bg-[#1e1e1e] prose-pre:rounded-xl prose-pre:border prose-pre:border-white/5 prose-hr:border-white/10 max-w-full">
                      <Markdown
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
                              <div className="my-6 group relative rounded-xl overflow-hidden border border-white/10">
                                <div className="bg-[#1e1e1e] px-4 py-2 text-[10px] font-black uppercase text-gray-500 border-b border-white/10 flex justify-between">
                                  <span>{match[1]}</span>
                                  <button className="hover:text-white transition-colors">Copiar</button>
                                </div>
                                <SyntaxHighlighter
                                  style={shadesOfPurple}
                                  language={match[1]}
                                  PreTag="div"
                                  customStyle={{ padding: '1.5rem', margin: 0, background: '#0d0d0d' }}
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              </div>
                            ) : (
                              <code className={`${className} bg-white/10 px-1 rounded text-white`} {...props}>
                                {children}
                              </code>
                            );
                          },
                        }}
                      >
                        {msg.content}
                      </Markdown>
                    </div>
                    
                    {msg.role === 'assistant' && (
                      <div className="mt-6 pt-4 border-t border-white/5 flex gap-4 text-gray-500">
                        <button className="hover:text-white transition-colors"><MoreHorizontal size={16} /></button>
                      </div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-9 h-9 rounded-full bg-[#ab68ff] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#ab68ff]/20 border border-white/10 group-hover:scale-110 transition-transform">
                      <User size={18} className="text-white" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            
            {isGenerating && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-4 text-white text-sm font-bold tracking-tight italic ml-14"
              >
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" />
                </div>
                {aiName} está gerando um pensamento profundo...
              </motion.div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input Container */}
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#212121] via-[#212121] to-transparent pt-20 pb-8 px-4 z-30">
          <div className="max-w-3xl mx-auto relative group">
            
            {/* File Previews */}
            <AnimatePresence>
              {files.length > 0 && (
                <div className="flex gap-2 mb-3 px-2 overflow-x-auto pb-2 custom-scrollbar">
                  {files.map((file, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="relative p-2 bg-[#2f2f2f] rounded-xl border border-white/10 flex items-center gap-3 pr-8 min-w-[140px] shadow-lg"
                    >
                      <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-400">
                        <FileIcon size={16} />
                      </div>
                      <div className="flex flex-col text-[10px] truncate">
                        <span className="text-gray-100 font-bold truncate">{file.file.name}</span>
                        <span className="text-gray-500 uppercase">{(file.file.size / 1024).toFixed(1)} KB</span>
                      </div>
                      <button 
                        onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white bg-black/20 p-1 rounded-full transition-all"
                      >
                        <X size={12} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </AnimatePresence>

            <div className={`relative flex items-end w-full bg-[#2f2f2f] rounded-[28px] border border-white/10 p-2 shadow-2xl transition-all duration-300 focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/10 ${isGenerating ? 'opacity-70 cursor-not-allowed' : 'hover:border-white/15'}`}>
              <div className="flex items-center pl-2 pb-2">
                <input
                  type="file"
                  id="file-attachment"
                  className="hidden"
                  onChange={(e) => {
                    const selected = Array.from(e.target.files || []);
                    setFiles(prev => [...prev, ...selected.map(f => ({ file: f, preview: URL.createObjectURL(f) }))]);
                  }}
                  multiple
                />
                <label 
                  htmlFor="file-attachment" 
                  className="p-3 text-gray-400 hover:text-white rounded-2xl cursor-pointer hover:bg-white/5 transition-all active:scale-90"
                >
                  <Paperclip size={20} />
                </label>
              </div>

              <textarea
                value={userInput}
                onChange={(e) => {
                  setUserInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isGenerating}
                placeholder="Pergunte qualquer coisa..."
                className="w-full bg-transparent border-none focus:ring-0 text-white py-3 px-3 resize-none min-h-[52px] scrollbar-hide text-[16px] leading-[1.6]" 
                rows={1}
              />

              <div className="flex items-center pr-2 pb-2 gap-2">
                <button
                  onClick={() => handleSendMessage()}
                  disabled={isGenerating || (!userInput.trim() && files.length === 0)}
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all shadow-lg ${
                    userInput.trim() || files.length > 0
                      ? 'bg-white text-black hover:scale-105 active:scale-95'
                      : 'bg-[#212121] text-gray-700'
                  }`}
                >
                  {isGenerating ? (
                    <div className="w-5 h-5 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2 text-[11px] text-gray-500 font-bold hover:text-white cursor-pointer transition-colors">
                <Sparkles size={12} className="text-white" /> Pro Architecture
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-500 font-bold hover:text-white cursor-pointer transition-colors">
                <Globe size={12} /> Deep Search
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-500 font-bold hover:text-white cursor-pointer transition-colors">
                <CircleHelp size={12} /> Support
              </div>
            </div>
            
            <p className="text-center text-[10px] text-gray-600 mt-4 leading-relaxed font-medium">
              React AI pode cometer erros. Verifique informações importantes. Desenvolvido por <span className="text-white">React Dev Elite</span>.
            </p>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-xl bg-[#212121] rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <h2 className="text-xl font-bold">Configurações</h2>
                <button onClick={() => setShowSettings(false)} className="text-gray-500 hover:text-white p-2 hover:bg-white/5 rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold">Tema do Chat</h3>
                    <p className="text-xs text-gray-500">Alterne entre modos de visualização</p>
                  </div>
                  <select className="bg-[#2f2f2f] border border-white/10 rounded-lg px-3 py-2 text-sm focus:ring-0">
                    <option>Escuro (Padrão)</option>
                    <option>Sistemas React</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold">Modelo de Linguagem</h3>
                    <p className="text-xs text-gray-500">Escolha o cérebro da sua IA</p>
                  </div>
                  <select className="bg-[#2f2f2f] border border-white/10 rounded-lg px-3 py-2 text-sm focus:ring-0">
                    <option>React AI Pro (1.5 Pro)</option>
                    <option>React AI Express (1.5 Flash)</option>
                  </select>
                </div>

                <div className="pt-4 flex justify-between items-center text-xs text-gray-500 border-t border-white/5">
                  <span>Versão 4.6.0-stable</span>
                  <button className="text-white hover:underline flex items-center gap-1">
                    Ver logs de atualização <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}