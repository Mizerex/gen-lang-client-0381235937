import React, { useState, useCallback, useEffect } from 'react';
import { generatePostDetails, generateSpeech, generateScriptFromTrend, transcribeVideo } from './services/geminiService';
import type { PostData, Trend } from './types';

// Let TypeScript know about the lamejs library loaded from the CDN
declare const lamejs: any;

// --- Helper Functions ---
const decodeBase64 = (base64: string): Uint8Array => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

/**
 * Converts raw PCM audio data into a Blob with a MP3 format.
 * @param pcmData The raw audio data as 16-bit integers.
 * @param sampleRate The sample rate of the audio (e.g., 24000).
 * @param numChannels The number of audio channels (e.g., 1 for mono).
 * @returns A Blob object representing the MP3 file.
 */
const pcmToMp3 = (pcmData: Int16Array, sampleRate: number, numChannels: number): Blob => {
    const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, 128); // 128 kbps
    const samples = pcmData;
    const sampleBlockSize = 1152; //can be anything but make it a multiple of 576 to make encoders life easier

    const mp3Data: Int8Array[] = [];
    for (let i = 0; i < samples.length; i += sampleBlockSize) {
        const sampleChunk = samples.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
    }
    const mp3buf = mp3encoder.flush();   //finish writing mp3

    if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
    }

    return new Blob(mp3Data, { type: 'audio/mpeg' });
};


// --- Static Data ---
const allTrendsData: Trend[] = [
    {"topic": "GTA 6: O Lançamento de 2025", "desc": "A internet está em contagem regressiva para o maior lançamento da década. Teorias sobre a história e o mapa de Vice City dominam as discussões.", "hashtags": ["#gta6", "#gtavi", "#rockstargames", "#gaming2025", "#vicecity"], "imageUrl": "https://placehold.co/600x300/F39C12/FFFFFF/png?text=GTA+6"},
    {"topic": "Chainsaw Man - O Filme: Arco da Reze", "desc": "A adaptação de um dos arcos mais amados do mangá promete ser o grande evento de anime de 2025. O hype para a estreia está em toda parte.", "hashtags": ["#chainsawman", "#rezebomb", "#mappa", "#anime2025", "#denji"], "imageUrl": "https://placehold.co/600x300/C0392B/FFFFFF/png?text=Chainsaw+Man+Filme"},
    {"topic": "Death Stranding 2: On The Beach", "desc": "A sequência do enigmático jogo de Hideo Kojima é uma das maiores apostas para 2025, gerando teorias e análises sobre o novo trailer.", "hashtags": ["#deathstranding2", "#hideokojima", "#ps5", "#gaming", "#normanreedus"], "imageUrl": "https://placehold.co/600x300/2C3E50/FFFFFF/png?text=Death+Stranding+2"},
    {"topic": "Animes com IA Generativa: A Tendência de 2026", "desc": "Debates sobre o uso de IA para criar sakugas e cenários estão esquentando. O que esperar dessa tecnologia no futuro dos animes?", "hashtags": ["#aianime", "#aiart", "#animefuture", "#tech", "#sakuga"], "imageUrl": "https://placehold.co/600x300/8E44AD/FFFFFF/png?text=Anime+IA"},
    {"topic": "One Punch Man: 3ª Temporada", "desc": "Após anos de espera, a nova temporada que adaptará o arco de Garou está confirmada e o hype para as animações das lutas é gigantesco.", "hashtags": ["#onepunchman", "#opm", "#saitama", "#garou", "#anime2025"], "imageUrl": "https://placehold.co/600x300/F1C40F/000000/png?text=One+Punch+Man+3"},
    {"topic": "Monster Hunter Wilds", "desc": "O próximo grande título da Capcom promete um mundo aberto dinâmico, sendo um dos jogos mais esperados de 2025.", "hashtags": ["#monsterhunter", "#mhwilds", "#capcom", "#rpg", "#gaming2025"], "imageUrl": "https://placehold.co/600x300/27AE60/FFFFFF/png?text=MH+Wilds"},
    {"topic": "Webtoons serão os novos Mangás em 2026?", "desc": "Com o sucesso de 'Solo Leveling', a indústria de animes está de olho nos webtoons coreanos. Qual será a próxima grande adaptação?", "hashtags": ["#webtoon", "#manhwa", "#sololeveling", "#anime", "#trend2026"], "imageUrl": "https://placehold.co/600x300/2980B9/FFFFFF/png?text=Webtoons+Trend"},
    {"topic": "Dragon Ball Daima", "desc": "A nova série de Dragon Ball com o traço clássico de Toriyama tem estreia marcada, e os fãs estão ansiosos para ver Goku pequeno novamente.", "hashtags": ["#dragonball", "#dragonballdaima", "#goku", "#akiratoriyama", "#anime"], "imageUrl": "https://placehold.co/600x300/E67E22/FFFFFF/png?text=DB+Daima"},
];

const availableVoices = [
    { id: 'Zephyr', name: 'Zephyr (Amigável)' },
    { id: 'Puck', name: 'Puck (Energético)' },
    { id: 'Charon', name: 'Charon (Calmo)' },
    { id: 'Fenrir', name: 'Fenrir (Profundo)' },
];


// --- SVG Icons ---
const LoadingSpinner: React.FC<{className?: string}> = ({ className }) => (
  <svg className={`animate-spin h-5 w-5 text-white ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const ClipboardCopyIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
);

const SparklesIcon: React.FC<{className?: string}> = ({className}) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const VideoIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.55a1 1 0 011.45.89V18a1 1 0 01-1.45.89L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);


// --- UI Components (defined outside App to prevent re-renders) ---

interface ActionButtonProps {
  onClick: () => void;
  isLoading: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}
const ActionButton: React.FC<ActionButtonProps> = ({ onClick, isLoading, disabled = false, children, className = '' }) => (
  <button
    onClick={onClick}
    disabled={isLoading || disabled}
    className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors ${className}`}
  >
    {isLoading ? <LoadingSpinner /> : children}
  </button>
);

interface CardProps {
    children: React.ReactNode;
    className?: string;
}
const Card: React.FC<CardProps> = ({ children, className }) => (
    <div className={`bg-surface rounded-lg shadow-lg p-6 ${className}`}>
        {children}
    </div>
);

interface TrendCardProps {
    trend: Trend;
    onCreateScript: (trend: Trend) => void;
    isCreatingScript: boolean;
}
const TrendCard: React.FC<TrendCardProps> = ({ trend, onCreateScript, isCreatingScript }) => {
    return (
        <Card className="flex flex-col p-0 overflow-hidden">
            <img src={trend.imageUrl} alt={trend.topic} className="w-full h-32 object-cover" />
            <div className="p-4 flex flex-col flex-grow space-y-3">
                <h3 className="text-lg font-bold text-primary">{trend.topic}</h3>
                <p className="text-on-surface flex-grow">{trend.desc}</p>
                <p className="text-on-surface-secondary text-sm">
                    {trend.hashtags.join(' ')}
                </p>
                <div className="mt-auto pt-2">
                    <button
                        onClick={() => onCreateScript(trend)}
                        disabled={isCreatingScript}
                        className="text-sm w-full px-3 py-2 rounded-md bg-primary/20 hover:bg-primary/30 transition-colors flex items-center justify-center disabled:bg-gray-600 disabled:cursor-not-allowed text-white"
                    >
                        {isCreatingScript ? <LoadingSpinner className="mr-2 h-4 w-4" /> : <SparklesIcon className="mr-2 h-4 w-4" />}
                        {isCreatingScript ? 'Criando...' : 'Criar Post'}
                    </button>
                </div>
            </div>
        </Card>
    );
};


// --- Main App Component ---

function App() {
  const [inputText, setInputText] = useState<string>('');
  const [postData, setPostData] = useState<PostData | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoadingPost, setIsLoadingPost] = useState<boolean>(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);
  const [loadingTrend, setLoadingTrend] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyNotification, setCopyNotification] = useState<string>('');
  const [displayedTrends, setDisplayedTrends] = useState<Trend[]>([]);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [selectedVoice, setSelectedVoice] = useState<string>('Zephyr');


  useEffect(() => {
    const pickRandomTrends = () => {
        const shuffled = [...allTrendsData].sort(() => 0.5 - Math.random());
        setDisplayedTrends(shuffled.slice(0, 2)); // Display 2 at a time
    };

    pickRandomTrends(); // Initial load
    const intervalId = setInterval(pickRandomTrends, 10000); // Update every 10 seconds

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, []);

  const handleGeneratePost = useCallback(async () => {
    if (!inputText.trim()) {
      setError("Por favor, insira um texto para começar.");
      return;
    }
    setIsLoadingPost(true);
    setError(null);
    setPostData(null);
    setAudioUrl(null);
    try {
      const result = await generatePostDetails(inputText);
      setPostData(result);
    } catch (e) {
      console.error(e);
      setError("Ocorreu um erro ao gerar o post. Tente novamente.");
    } finally {
      setIsLoadingPost(false);
    }
  }, [inputText]);

  const handleGenerateAudio = useCallback(async () => {
    if (!postData) return;
    setIsLoadingAudio(true);
    setError(null);
    setAudioUrl(null);
    try {
      const base64Audio = await generateSpeech(postData.cleanedText, selectedVoice);
      if (base64Audio) {
        const audioBytes = decodeBase64(base64Audio);
        // The API returns raw 16-bit PCM data. We need to convert it to a MP3 file to be playable and downloadable.
        const pcmData = new Int16Array(audioBytes.buffer);
        const mp3Blob = pcmToMp3(pcmData, 24000, 1); // Gemini TTS uses 24kHz sample rate, 1 channel
        const url = URL.createObjectURL(mp3Blob);
        setAudioUrl(url);
      } else {
        throw new Error("A API não retornou dados de áudio.");
      }
    } catch (e) {
      console.error(e);
      setError("Ocorreu um erro ao gerar o áudio. Tente novamente.");
    } finally {
      setIsLoadingAudio(false);
    }
  }, [postData, selectedVoice]);
  
  const handleCreateScript = useCallback(async (trend: Trend) => {
    setLoadingTrend(trend.topic);
    setError(null);
    try {
      const script = await generateScriptFromTrend(trend);
      setInputText(script);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Ocorreu um erro desconhecido.";
      setError(`Falha ao gerar roteiro: ${errorMessage}`);
    } finally {
      setLoadingTrend(null);
    }
  }, []);

  const handleCopyToClipboard = useCallback(() => {
    if (!postData) return;
    const fullPostText = `🎬 Título:
${postData.title}

🧾 Texto Finalizado:
${postData.cleanedText}

💬 Pergunta:
${postData.question}

🏷️ Hashtags:
${postData.hashtags.join(' ')}
    `.trim();

    navigator.clipboard.writeText(fullPostText).then(() => {
        setCopyNotification('Copiado para a área de transferência!');
        setTimeout(() => setCopyNotification(''), 2500);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        setError('Não foi possível copiar o texto.');
    });
  }, [postData]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
        setSelectedVideoFile(event.target.files[0]);
    } else {
        setSelectedVideoFile(null);
    }
  };

  const handleTranscribeVideo = useCallback(async () => {
    if (!selectedVideoFile) {
        setError("Por favor, selecione um arquivo de vídeo.");
        return;
    }
    setIsTranscribing(true);
    setError(null);
    try {
        const script = await transcribeVideo(selectedVideoFile);
        setInputText(script);
        setSelectedVideoFile(null); // Reset file input after use
        const fileInput = document.getElementById('video_upload') as HTMLInputElement;
        if(fileInput) fileInput.value = '';
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "Ocorreu um erro desconhecido.";
        setError(`Falha ao transcrever vídeo: ${errorMessage}`);
    } finally {
        setIsTranscribing(false);
    }
  }, [selectedVideoFile]);

  return (
    <div className="min-h-screen bg-brand-bg text-on-surface font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            Criador de Postagens Virais
          </h1>
          <p className="mt-2 text-lg text-on-surface-secondary">
            Transforme seus roteiros em conteúdo pronto para decolar!
          </p>
        </header>

        {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg relative mb-6" role="alert">
                <strong className="font-bold">Erro: </strong>
                <span className="block sm:inline">{error}</span>
            </div>
        )}

        <main className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 flex flex-col space-y-8">
            <Card>
              <label htmlFor="input_text" className="text-2xl font-bold mb-4 block">1. Insira seu Roteiro</label>
              <textarea
                id="input_text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Cole aqui o texto ou crie um post a partir de um tópico em alta..."
                className="w-full h-48 p-3 bg-brand-bg border border-gray-600 rounded-md focus:ring-2 focus:ring-primary focus:border-primary transition"
              />
              <ActionButton
                onClick={handleGeneratePost}
                isLoading={isLoadingPost}
                disabled={!inputText.trim()}
                className="mt-4"
              >
                🧹 Limpar e Gerar Post
              </ActionButton>
            </Card>

            <Card>
                <h2 className="text-xl font-bold mb-2">Alternativa: Extrair de Vídeo</h2>
                <p className="text-on-surface-secondary text-sm mb-4">Envie um vídeo para transcrever o áudio e usar como roteiro.</p>
                <div className="flex items-center space-x-2">
                    <label htmlFor="video_upload" className="flex-1 truncate cursor-pointer bg-brand-bg border border-gray-600 rounded-md p-3 text-center text-on-surface-secondary hover:border-primary transition">
                    {selectedVideoFile ? selectedVideoFile.name : "Escolher arquivo (MP4, MOV...)"}
                    </label>
                    <input id="video_upload" type="file" className="hidden" accept="video/*" onChange={handleFileChange} />
                </div>
                <ActionButton
                    onClick={handleTranscribeVideo}
                    isLoading={isTranscribing}
                    disabled={!selectedVideoFile || isTranscribing}
                    className="mt-4"
                >
                    <VideoIcon className="mr-2 h-5 w-5" />
                    Transcrever Vídeo
                </ActionButton>
            </Card>

            {postData && (
              <Card>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">2. Conteúdo Gerado</h2>
                    <button
                        onClick={handleCopyToClipboard}
                        className="flex items-center px-3 py-2 text-sm font-medium text-on-surface-secondary bg-white/5 hover:bg-white/10 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface focus:ring-primary"
                        aria-label="Copiar todo o conteúdo gerado"
                    >
                        <ClipboardCopyIcon className="mr-2" />
                        Copiar Tudo
                    </button>
                </div>
                <div className="space-y-4 text-on-surface">
                    <div>
                        <h3 className="font-semibold text-primary">🎬 Título</h3>
                        <p>{postData.title}</p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-primary">🧾 Texto Finalizado</h3>
                        <p className="whitespace-pre-wrap">{postData.cleanedText}</p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-primary">💬 Pergunta</h3>
                        <p>{postData.question}</p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-primary">🏷️ Hashtags</h3>
                        <p className="text-on-surface-secondary">{postData.hashtags.join(' ')}</p>
                    </div>
                </div>
                <div className="mt-6">
                    <h3 className="font-semibold text-primary mb-3">🎙️ Escolha a Voz da Narração</h3>
                    <div className="flex flex-wrap gap-2">
                        {availableVoices.map((voice) => (
                            <button
                                key={voice.id}
                                onClick={() => setSelectedVoice(voice.id)}
                                className={`px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface focus:ring-primary ${
                                    selectedVoice === voice.id
                                        ? 'bg-primary text-white shadow-md'
                                        : 'bg-brand-bg hover:bg-white/10 text-on-surface-secondary border border-gray-600'
                                }`}
                            >
                                {voice.name}
                            </button>
                        ))}
                    </div>
                </div>
                <ActionButton
                    onClick={handleGenerateAudio}
                    isLoading={isLoadingAudio}
                    className="mt-6"
                >
                    🔊 Gerar Narração
                </ActionButton>
              </Card>
            )}

            {audioUrl && (
                <Card>
                    <h2 className="text-2xl font-bold mb-4">3. Prévia do Áudio</h2>
                    <audio controls src={audioUrl} className="w-full">
                        Your browser does not support the audio element.
                    </audio>
                    <a
                        href={audioUrl}
                        download="narracao.mp3"
                        className="mt-4 inline-block w-full text-center px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md font-semibold transition-colors"
                    >
                        👉 Baixar MP3
                    </a>
                </Card>
            )}
          </div>

          <div className="lg:col-span-2">
            <Card>
                <h2 className="text-2xl font-bold mb-4">🔥 Em Alta</h2>
                <div className="space-y-4">
                    {displayedTrends.map(trend => (
                        <TrendCard 
                            key={trend.topic} 
                            trend={trend} 
                            onCreateScript={handleCreateScript}
                            isCreatingScript={loadingTrend === trend.topic}
                        />
                    ))}
                </div>
            </Card>
          </div>
        </main>

        {copyNotification && (
            <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-gray-800 border border-primary text-white px-6 py-3 rounded-lg shadow-lg">
                {copyNotification}
            </div>
        )}

      </div>
    </div>
  );
}

export default App;