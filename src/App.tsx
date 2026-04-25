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
  Share,
  PlayCircle,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

import { 
  auth, 
  googleProvider, 
  db, 
  handleFirestoreError, 
  OperationType,
  testConnection
} from './lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  setDoc, 
  doc, 
  serverTimestamp, 
  getDoc,
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  limit,
  Timestamp as FirestoreTimestamp,
  writeBatch
} from 'firebase/firestore';

interface Message {
  role: 'user' | 'assistant' | 'group';
  content: string;
  id: string;
  senderId?: string;
  senderName?: string;
  senderPhoto?: string;
  timestamp?: any;
  files?: { name: string, type: string }[];
}

interface Group {
  id: string;
  name: string;
  description: string;
}

export default function App() {
  const aiName = "React AI";
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [groupMessages, setGroupMessages] = useState<Message[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [files, setFiles] = useState<FileUpload[]>([]);
  
  // Advanced AI Configs
  const [temperature, setTemperature] = useState(0.7);
  const [activePersona, setActivePersona] = useState('Platinum');
  const [uiStyle, setUiStyle] = useState('Cyber'); // Cyber, Minimal, Classic
  const [memoryLimit, setMemoryLimit] = useState(15);
  const [showConfig, setShowConfig] = useState(false);
  const [deepSearch, setDeepSearch] = useState(false);
  const [language, setLanguage] = useState('Português');
  const [tokenUsage, setTokenUsage] = useState(0);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    testConnection();
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Sync user to Firestore
        const userRef = doc(db, 'users', u.uid);
        try {
          await setDoc(userRef, {
            uid: u.uid,
            displayName: u.displayName,
            email: u.email,
            photoURL: u.photoURL,
            createdAt: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          console.error("Sync user error:", err);
        }
      }
    });
    return unsubscribe;
  }, []);

  // Listen for groups
  useEffect(() => {
    if (!user) {
      setGroups([]);
      return;
    }
    const q = query(collection(db, 'groups'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const gList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Group));
      setGroups(gList);
    }, (error) => {
      console.error("Groups listener error:", error);
    });
    return unsubscribe;
  }, [user]);

  // Listen for active group messages
  useEffect(() => {
    if (!activeGroup || !user) {
      setGroupMessages([]);
      return;
    }
    const q = query(
      collection(db, 'groups', activeGroup.id, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          role: 'group',
          content: data.content,
          senderId: data.senderId,
          senderName: data.senderName,
          senderPhoto: data.senderPhoto,
          timestamp: data.timestamp
        } as Message;
      });
      setGroupMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `groups/${activeGroup.id}/messages`);
    });
    return unsubscribe;
  }, [activeGroup, user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, groupMessages, activeGroup]);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setActiveGroup(null);
  };

  const createGroup = async () => {
    if (!user) return;
    const name = prompt("Nome do grupo:");
    if (!name) return;
    
    try {
      const batch = writeBatch(db);
      const groupRef = doc(collection(db, 'groups'));
      const groupId = groupRef.id;
      
      batch.set(groupRef, {
        name,
        description: "Chat em grupo",
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });
      
      const memberRef = doc(db, 'groups', groupId, 'members', user.uid);
      batch.set(memberRef, {
        userId: user.uid,
        joinedAt: serverTimestamp(),
        role: 'owner'
      });
      
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'groups');
    }
  };

  const joinGroup = async (groupId: string) => {
    if (!user) return;
    try {
      const memberRef = doc(db, 'groups', groupId, 'members', user.uid);
      await setDoc(memberRef, {
        userId: user.uid,
        joinedAt: serverTimestamp(),
        role: 'member'
      });
    } catch (error) {
       handleFirestoreError(error, OperationType.WRITE, `groups/${groupId}/members`);
    }
  };

  const handleSendMessage = async (textToSubmit?: string) => {
    const finalInput = textToSubmit || userInput;
    if ((!finalInput.trim() && files.length === 0) || isGenerating) return;

    if (activeGroup) {
      if (!user) {
        login();
        return;
      }
      try {
        // Ensure user is member before sending (or syncly join)
        const memberRef = doc(db, 'groups', activeGroup.id, 'members', user.uid);
        const memberSnap = await getDoc(memberRef);
        if (!memberSnap.exists()) {
          await setDoc(memberRef, {
            userId: user.uid,
            joinedAt: serverTimestamp(),
            role: 'member'
          });
        }

        const msgPath = `groups/${activeGroup.id}/messages`;
        await addDoc(collection(db, msgPath), {
          content: finalInput,
          senderId: user.uid,
          senderName: user.displayName || user.email,
          senderPhoto: user.photoURL,
          timestamp: serverTimestamp()
        });
        setUserInput('');
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `groups/${activeGroup.id}/messages`);
      }
      return;
    }

    const userMessage: Message = { 
      role: 'user', 
      content: finalInput, 
      id: Date.now().toString(),
      files: files.map(f => ({ name: f.file.name, type: f.file.type }))
    };

    setMessages(prev => [...prev, userMessage]);
    setUserInput('');
    setIsGenerating(true);

    try {
      const history = messages.slice(-memoryLimit).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const parts: Part[] = [{ text: finalInput }];

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

      const personas: Record<string, string> = {
        'Platinum': 'Você é o React Platinum CORE. Respostas de elite, técnicas e equilibradas.',
        'Codificador': 'Foque exclusivamente em código. Responda apenas com snippets comentados e explicações de arquitetura.',
        'Criativo': 'Seja poético, use metáforas e gere ideias inovadoras fora da caixa.',
        'Streamer': 'Aja como um Streamer React hiper-enérgico. Use gírias da internet, exclamações e analise mídia com empolgação total.',
        'Cientista': 'Postura acadêmica. Cite conceitos teóricos, use linguagem formal e dados estruturados.',
      };

      const systemPrompt = `Você é o sistema de IA operando sob o perfil: ${personas[activePersona]}.
      IDIOMA DE RESPOSTA PRIORITÁRIO: ${language}.
      ESTILO DE RESPOSTA ATUAL: ${activePersona.toUpperCase()}.
      DEEP SEARCH ATIVADO: ${deepSearch ? 'SIM (Realize buscas mentais extensas e cross-reference informações)' : 'NÃO'}.
      REGRAS DE OURO:
      1. Respostas em Markdown de nível editorial.
      2. Profundidade Técnica de acordo com a persona.
      3. Código sem erros e documentado.
      4. Se houver vídeo/imagem, integre a análise visual no contexto da persona escolhida.`;
      
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [...history, { role: 'user', parts }],
        config: { 
          systemInstruction: systemPrompt,
          temperature: temperature,
        }
      });

      let responseText = result.text || "Ops, não consegui processar isso agora.";

      // Simple token estimation
      const estimatedTokens = responseText.length / 4;
      setTokenUsage(prev => Math.min(prev + estimatedTokens, 1000000));
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: responseText, 
        id: (Date.now() + 1).toString() 
      }]);

    } catch (error: any) {
      console.error(error);
      let errorMsg = "Houve um erro técnico. Por favor, tente novamente em alguns segundos.";
      
      if (error.message?.includes('429')) {
        errorMsg = "Limite de requisições (Quota) atingido para este modelo. Por favor, aguarde um minuto antes de tentar novamente.";
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: errorMsg, 
        id: Date.now().toString() 
      }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setIsSidebarOpen(false);
  };

  const suggestions = [
    { title: "Gere Código React", sub: "componente de dashboard moderno", icon: <Zap size={20} className="text-yellow-400" /> },
    { title: "Arquitetura Cloud", sub: "desenhe uma infra serverless", icon: <Globe size={20} className="text-blue-400" /> },
    { title: "Debug Complexo", sub: "analise este snippet de código", icon: <CircleHelp size={20} className="text-pink-400" /> },
    { title: "Prompt Engineering", sub: "otimize meu fluxo de trabalho", icon: <Sparkles size={20} className="text-purple-400" /> },
    { title: "Escrita Criativa", sub: "roteiro para vídeo tech", icon: <ImageIcon size={20} className="text-emerald-400" /> },
    { title: "Análise de Dados", sub: "processamento de CSV em Python", icon: <FileIcon size={20} className="text-blue-500" /> }
  ];

  return (
    <div className={`flex h-screen w-full bg-[#212121] text-[#ececec] font-sans overflow-hidden ${uiStyle === 'Minimal' ? 'ui-minimal' : ''}`}>
      {/* Sidebar Overlay Logic */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40"
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ 
          x: isSidebarOpen ? 0 : -300,
          width: 300 
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="bg-[#171717] h-full flex flex-col border-r border-white/10 fixed left-0 top-0 z-50 overflow-hidden shadow-2xl"
      >
        <div className="p-4 flex items-center justify-between border-b border-white/5 bg-[#1a1a1a]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
              <Sparkles size={18} className="text-black" />
            </div>
            <span className="font-black text-[10px] uppercase tracking-[0.2em]">{aiName} HUB</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8 custom-scrollbar">
          {/* Main Actions */}
          <button 
            onClick={startNewChat}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-white hover:bg-gray-200 text-black rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-95"
          >
            <Plus size={18} />
            Inovação Total
          </button>

          {/* AI ENGINE CONFIG */}
          <div className="space-y-5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Motor de Configuração</span>
              <button onClick={() => setShowConfig(!showConfig)} className="text-white/40 hover:text-white transition-colors">
                <Settings size={14} className={showConfig ? "rotate-90 transition-transform" : "transition-transform"} />
              </button>
            </div>

            {showConfig && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="space-y-5 p-4 bg-white/[0.03] rounded-3xl border border-white/5"
              >
                <div className="space-y-3">
                  <div className="flex justify-between text-[10px] font-black tracking-widest">
                    <span className="text-gray-500">TEMPERATURA</span>
                    <span className="text-white px-2 py-0.5 bg-white/10 rounded">{temperature}</span>
                  </div>
                  <input 
                    type="range" min="0" max="2" step="0.1" 
                    value={temperature} 
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                  />
                  <div className="flex justify-between text-[8px] text-gray-600 font-black">
                    <span>PRECISÃO</span>
                    <span>CRIATIVIDADE</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="text-[10px] font-black text-gray-500 tracking-widest text-center block">PERSONA ATIVA</span>
                  <div className="grid grid-cols-1 gap-2">
                    {['Platinum', 'Codificador', 'Criativo', 'Streamer', 'Cientista'].map(p => (
                      <button
                        key={p}
                        onClick={() => setActivePersona(p)}
                        className={`py-2 px-3 rounded-xl text-[10px] font-bold text-left transition-all border ${activePersona === p ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-400 border-white/5 hover:border-white/20'}`}
                      >
                        {p.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="text-[10px] font-black text-gray-500 tracking-widest text-center block">IDIOMA DO NÚCLEO</span>
                  <div className="flex gap-2">
                    {['Português', 'English', 'Español'].map(lang => (
                      <button
                        key={lang}
                        onClick={() => setLanguage(lang)}
                        className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold border ${language === lang ? 'bg-white/20 text-white border-white/20' : 'bg-transparent text-gray-500 border-white/5 hover:border-white/10'}`}
                      >
                        {lang.slice(0, 3).toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-2">
                    <Globe size={14} className={deepSearch ? 'text-blue-400' : 'text-gray-500'} />
                    <span className="text-[10px] font-bold text-gray-300">DEEP SEARCH</span>
                  </div>
                  <button 
                    onClick={() => setDeepSearch(!deepSearch)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${deepSearch ? 'bg-blue-600' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${deepSearch ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-black text-gray-500 tracking-widest">
                    <span>CONSUMO DE TOKENS</span>
                    <span className="text-white/50">{tokenUsage.toFixed(0)} / 1M</span>
                  </div>
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${(tokenUsage / 1000000) * 100}%` }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* UI STYLE */}
            <div className="space-y-3">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 px-1">Ambiente Visual</span>
              <div className="grid grid-cols-3 gap-2 p-1.5 bg-white/5 rounded-2xl border border-white/5">
                {['Cyber', 'Minimal', 'Classic'].map(style => (
                  <button
                    key={style}
                    onClick={() => setUiStyle(style)}
                    className={`py-2.5 text-[9px] font-black rounded-xl transition-all ${uiStyle === style ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                  >
                    {style.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* GROUPS */}
          {user && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Grupos da Comunidade</span>
                <button onClick={createGroup} className="text-emerald-500 hover:text-emerald-400 transition-colors">
                  <Plus size={14} />
                </button>
              </div>
              <div className="space-y-1">
                <button 
                  onClick={() => setActiveGroup(null)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${!activeGroup ? 'bg-white text-black border-white' : 'bg-transparent text-gray-400 border-transparent hover:bg-white/5'}`}
                >
                  <Sparkles size={14} />
                  IA Individual
                </button>
                {groups.map(g => (
                  <button 
                    key={g.id}
                    onClick={() => setActiveGroup(g)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${activeGroup?.id === g.id ? 'bg-white text-black border-white' : 'bg-transparent text-gray-400 border-transparent hover:bg-white/5'}`}
                  >
                    <div className="w-5 h-5 rounded bg-white/10 flex items-center justify-center text-[10px]">#</div>
                    <span className="truncate">{g.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* WORKSPACE */}
          <div className="space-y-3">
            <div className="text-[10px] uppercase text-white/30 font-black px-1 tracking-[0.2em]">Workspace</div>
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-4">
              <div className="flex items-center justify-between group cursor-pointer" onClick={startNewChat}>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shadow-[0_0_10px_currentColor] animate-pulse ${isGenerating ? 'bg-amber-500 text-amber-500/50' : 'bg-emerald-500 text-emerald-500/50'}`} />
                  <span className="text-xs font-bold text-gray-200">{isGenerating ? 'IA Operando...' : 'Núcleo Online'}</span>
                </div>
                <MoreHorizontal size={14} className="text-gray-600 group-hover:text-white transition-colors" />
              </div>
              <div className="flex items-center gap-3 text-gray-600 group cursor-pointer hover:text-white transition-colors px-0.5" onClick={() => setMessages([])}>
                <Trash2 size={14} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Limpar Contexto</span>
              </div>
            </div>
          </div>

          {/* LABS / EXPERIMENTAL */}
          <div className="space-y-3 pb-8">
            <div className="text-[10px] uppercase text-amber-500/30 font-black px-1 tracking-[0.2em]">Platinum Labs</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center gap-2 group cursor-pointer hover:border-amber-500/30 transition-all">
                <Zap size={16} className="text-amber-500/50 group-hover:text-amber-500 transition-all" />
                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Speed Boost</span>
              </div>
              <div className="p-3 bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center gap-2 group cursor-pointer hover:border-blue-500/30 transition-all">
                <Globe size={16} className="text-blue-500/50 group-hover:text-blue-500 transition-all" />
                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">VPN Tunnel</span>
              </div>
            </div>
          </div>
        </div>

        {/* User Card */}
        <div className="p-4 bg-[#1a1a1a] border-t border-white/5">
          {!user ? (
            <button 
              onClick={login}
              className="w-full flex items-center justify-center gap-2 py-3 bg-white text-black rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
            >
              <User size={16} /> Entrar com Google
            </button>
          ) : (
            <div className="bg-gradient-to-br from-white/5 to-transparent p-4 rounded-2xl border border-white/5 group relative overflow-hidden">
              <div className="flex items-center gap-3 relative z-10">
                {user.photoURL ? (
                  <img src={user.photoURL} className="w-10 h-10 rounded-xl" alt="avatar" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-black font-black text-xs">
                    {user.displayName?.charAt(0) || 'U'}
                  </div>
                )}
                <div className="flex-1">
                  <div className="text-xs font-black text-white tracking-widest truncate max-w-[120px]">{user.displayName?.toUpperCase()}</div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase">Membro Platinum</div>
                </div>
                <button onClick={logout} className="p-2 hover:bg-red-500/10 text-gray-500 hover:text-red-500 rounded-lg transition-colors">
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          )}
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
              {activeGroup ? activeGroup.name : aiName} <span className="not-italic text-[10px] bg-white px-2 py-0.5 rounded-full font-bold text-black ml-1 uppercase">{activeGroup ? 'GROUP' : 'PLATINUM'}</span>
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
            {!activeGroup && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[70vh] text-center px-4 max-w-2xl mx-auto">
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-20 h-20 bg-gradient-to-br from-white to-gray-400 rounded-[2rem] flex items-center justify-center mb-10 shadow-[0_0_50px_rgba(255,255,255,0.1)] border border-white/20"
                >
                  <Sparkles size={40} className="text-black" />
                </motion.div>
                <motion.h1 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-4xl md:text-5xl font-black mb-4 tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500"
                >
                  O que vamos<br />construir hoje?
                </motion.h1>
                <motion.p 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-gray-500 text-sm font-medium mb-12 max-w-sm"
                >
                  Acesse o poder do modelo Platinum para codificação, análise e criatividade sem limites.
                </motion.p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  {suggestions.map((s, i) => (
                    <motion.button 
                      key={i}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.3 + (i * 0.1) }}
                      onClick={() => handleSendMessage(s.title + " " + s.sub)}
                      className="p-5 bg-white/5 hover:bg-white/[0.08] border border-white/10 rounded-3xl text-left transition-all active:scale-[0.98] group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 blur-3xl -mr-12 -mt-12 group-hover:bg-white/10 transition-colors" />
                      <div className="mb-4 bg-white/5 w-10 h-10 rounded-xl flex items-center justify-center ring-1 ring-white/10 group-hover:ring-white/20 transition-all">
                        {s.icon}
                      </div>
                      <div className="font-bold text-sm text-white mb-1 group-hover:translate-x-1 transition-transform">{s.title}</div>
                      <div className="text-[12px] text-gray-500 font-medium">{s.sub}</div>
                    </motion.button>
                  ))}
                </div>
              </div>
            ) : activeGroup ? (
              <AnimatePresence>
                {groupMessages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex gap-4 md:gap-6 ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.senderId !== user?.uid && (
                      <div className="w-9 h-9 rounded-full bg-[#2f2f2f] flex items-center justify-center flex-shrink-0 border border-white/10 overflow-hidden">
                        {msg.senderPhoto ? <img src={msg.senderPhoto} alt="av" className="w-full h-full" /> : <User size={18} className="text-gray-500" />}
                      </div>
                    )}

                    <div className={`max-w-[85%] leading-relaxed ${
                      msg.senderId === user?.uid 
                        ? 'bg-gradient-to-br from-[#2f2f2f] to-[#252525] text-white px-6 py-4 rounded-[24px] ml-auto border border-white/10 shadow-xl' 
                        : 'bg-white/5 text-gray-200 px-6 py-4 rounded-[24px] border border-white/5'
                    }`}>
                      {msg.senderId !== user?.uid && (
                        <div className="flex items-center gap-2 mb-2">
                           <div className="font-black text-[9px] uppercase tracking-[0.1em] text-white/40">
                            {msg.senderName}
                          </div>
                        </div>
                      )}
                      <div className="text-sm md:text-md">{msg.content}</div>
                      <div className="text-[8px] text-white/20 mt-2 font-black uppercase tracking-widest text-right">
                        {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                      </div>
                    </div>

                    {msg.senderId === user?.uid && (
                      <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 border border-white/10 text-black font-black text-[10px] overflow-hidden">
                        {user.photoURL ? <img src={user.photoURL} alt="av" className="w-full h-full" /> : 'U'}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            ) : (
              <AnimatePresence>
                {messages.map((msg, index) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex gap-4 md:gap-6 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 animate-pulse-slow shadow-lg shadow-white/5 border border-white/10">
                        <Sparkles size={18} className="text-black" />
                      </div>
                    )}

                    <div className={`max-w-[100%] leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-gradient-to-br from-[#2f2f2f] to-[#252525] text-white px-6 py-5 rounded-[28px] ml-auto border border-white/10 shadow-xl' 
                        : 'bg-transparent text-gray-200 flex-1'
                    }`}>
                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-2 mb-4">
                           <div className="font-black text-[9px] uppercase tracking-[0.2em] text-white/40 bg-white/5 px-2 py-1 rounded">
                            {aiName} CORE
                          </div>
                          <div className="h-[1px] flex-1 bg-white/[0.05]" />
                        </div>
                      )}
                      
                      <div className="markdown-body prose prose-invert max-w-full">
                        <Markdown
                          components={{
                            code({ node, inline, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || '');
                              return !inline && match ? (
                                <div className="my-6 group relative rounded-xl overflow-hidden border border-white/10 bg-[#0d0d0d]">
                                  <div className="bg-[#1a1a1a] px-4 py-2 text-[10px] font-black uppercase text-gray-500 border-b border-white/5 flex justify-between items-center">
                                    <span>{match[1]}</span>
                                    <button 
                                      onClick={() => navigator.clipboard.writeText(String(children))}
                                      className="hover:text-white transition-colors text-[10px]"
                                    >
                                      Copiar
                                    </button>
                                  </div>
                                  <SyntaxHighlighter
                                    style={shadesOfPurple}
                                    language={match[1]}
                                    PreTag="div"
                                    customStyle={{ padding: '1.5rem', margin: 0, background: 'transparent' }}
                                    {...props}
                                  >
                                    {String(children).replace(/\n$/, '')}
                                  </SyntaxHighlighter>
                                </div>
                              ) : (
                                <code className={`${className} bg-white/10 px-1.5 py-0.5 rounded text-white`} {...props}>
                                  {children}
                                </code>
                              );
                            },
                          }}
                        >
                          {msg.content}
                        </Markdown>
                      </div>
                    </div>

                    {msg.role === 'user' && (
                      <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 border border-white/10 text-black font-black text-[10px]">
                        U
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            
            {isGenerating && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-6 ml-14"
              >
                <div className="relative w-9 h-9 flex items-center justify-center">
                  <div className="absolute inset-0 bg-white/20 rounded-full animate-ping" />
                  <div className="relative w-2 h-2 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,1)]" />
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/30">Processando Requisição</div>
                  <div className="text-sm font-bold text-white italic animate-pulse">Sincronizando neurônios virtuais...</div>
                </div>
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
                      className="relative p-2 bg-[#2f2f2f] rounded-xl border border-white/10 flex items-center gap-3 pr-8 min-w-[160px] shadow-xl group"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden ${file.file.type.startsWith('video/') ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {file.file.type.startsWith('image/') ? (
                          <img src={file.preview} alt="preview" className="w-full h-full object-cover" />
                        ) : file.file.type.startsWith('video/') ? (
                          <PlayCircle size={20} />
                        ) : (
                          <FileIcon size={18} />
                        )}
                      </div>
                      <div className="flex flex-col text-[10px] truncate">
                        <span className="text-gray-100 font-bold truncate max-w-[80px]">{file.file.name}</span>
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
                  id="media-attachment"
                  className="hidden"
                  accept="video/*,image/*"
                  onChange={(e) => {
                    const selected = Array.from(e.target.files || []);
                    setFiles(prev => [...prev, ...selected.map(f => ({ file: f, preview: URL.createObjectURL(f) }))]);
                  }}
                  multiple
                />
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
                  htmlFor="media-attachment" 
                  className="p-3 text-gray-400 hover:text-white rounded-2xl cursor-pointer hover:bg-white/5 transition-all active:scale-90"
                  title="Abrir Galeria (Vídeos/Fotos)"
                >
                  <ImageIcon size={20} />
                </label>
                <label 
                  htmlFor="file-attachment" 
                  className="p-3 text-gray-400 hover:text-white rounded-2xl cursor-pointer hover:bg-white/5 transition-all active:scale-90"
                  title="Anexar arquivos"
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
                placeholder={activeGroup ? `Mensagem para #${activeGroup.name}...` : "Pergunte qualquer coisa..."}
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