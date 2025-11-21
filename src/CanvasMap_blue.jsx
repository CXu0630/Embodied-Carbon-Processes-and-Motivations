import React, { useState, useRef, useEffect } from 'react';
import { Map, X, ChevronRight, ZoomIn, ZoomOut, Loader } from 'lucide-react';

// --- Helper: Asset Path Normalization ---
// Handles GitHub Pages subdirectories via PUBLIC_URL.
// Ensure your build tool (Vite/CRA) sets this environment variable correctly.
// const getAssetPath = (path) => {
//   const cleanPath = path.startsWith('/') ? path.slice(1) : path;
//   // For Vite users, you might replace process.env.PUBLIC_URL with import.meta.env.BASE_URL
//   const baseUrl = process.env.PUBLIC_URL || ''; 
//   return `${baseUrl}/${cleanPath}`;
// };

// For Vite
const getAssetPath = (path) => {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const baseUrl = import.meta.env.BASE_URL || '/';
  // Ensure exactly one slash between base and path
  return `${baseUrl.replace(/\/$/, '')}/${cleanPath}`;
};

// --- Component: Markdown Renderer ---
// Parses simple markdown syntax and handles the custom [[id|Label]] links
const MarkdownRenderer = ({ content, onLinkClick }) => {
  if (!content) return <div className="text-slate-500 animate-pulse">Loading archives...</div>;

  const lines = content.trim().split('\n');
  
  const parseInline = (text) => {
    // Regex to match [[id|label]]
    const parts = text.split(/(\[\[\d+\|.*?\]\])/g);
    
    return parts.map((part, i) => {
      const linkMatch = part.match(/^\[\[(\d+)\|(.*?)\]\]$/);
      if (linkMatch) {
        return (
          <button
            key={i}
            onClick={() => onLinkClick(parseInt(linkMatch[1]))}
            className="text-indigo-400 hover:text-indigo-300 font-semibold hover:underline decoration-indigo-500/50 underline-offset-4 inline-flex items-center gap-1 transition-colors bg-indigo-500/10 px-1 rounded mx-0.5"
          >
            {linkMatch[2]}
          </button>
        );
      }

      // Bold **text**
      const boldParts = part.split(/(\*\*.*?\*\*)/g);
      return boldParts.map((bPart, j) => {
        if (bPart.startsWith('**') && bPart.endsWith('**')) {
          return <strong key={`${i}-${j}`} className="text-white font-bold">{bPart.slice(2, -2)}</strong>;
        }
        
        // Italic *text*
        const italicParts = bPart.split(/(\*.*?\*)/g);
        return italicParts.map((iPart, k) => {
          if (iPart.startsWith('*') && iPart.endsWith('*')) {
            return <em key={`${i}-${j}-${k}`} className="text-indigo-200">{iPart.slice(1, -1)}</em>;
          }
          return iPart;
        });
      });
    });
  };

  return (
    <div className="space-y-4 text-slate-300 leading-relaxed">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-2" />; // Spacer
        
        if (trimmed.startsWith('# ')) 
          return <h1 key={index} className="text-3xl font-bold text-white mt-6 mb-4 pb-2 border-b border-slate-700">{parseInline(trimmed.slice(2))}</h1>;
        
        if (trimmed.startsWith('## ')) 
          return <h2 key={index} className="text-xl font-semibold text-indigo-100 mt-6 mb-2">{parseInline(trimmed.slice(3))}</h2>;
        
        if (trimmed.startsWith('> '))
          return <blockquote key={index} className="border-l-4 border-indigo-500 pl-4 italic text-slate-400 my-4">{parseInline(trimmed.slice(2))}</blockquote>;
        
        if (trimmed.startsWith('- ') || trimmed.startsWith('* '))
          return (
            <div key={index} className="flex items-start gap-2 ml-2">
              <span className="text-indigo-500 mt-1.5">•</span>
              <span>{parseInline(trimmed.slice(2))}</span>
            </div>
          );
          
        return <p key={index}>{parseInline(trimmed)}</p>;
      })}
    </div>
  );
};

// --- Main Component: CanvasMap ---
export default function CanvasMap() {
  // 1. Configuration & Data State
  const [mapConfig, setMapConfig] = useState({ width: 0, height: 0, loaded: false });
  const [points, setPoints] = useState([]);
  
  // 2. Viewport State
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  
  // 3. Interaction State
  const [selectedId, setSelectedId] = useState(null);
  const [activeContent, setActiveContent] = useState(null);

  // 4. Refs for Drag Math
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // --- Lifecycle: Load Assets ---
  useEffect(() => {
    // Fetch Points Configuration
    fetch(getAssetPath('texts/points.json'))
      .then(res => res.json())
      .then(data => setPoints(data))
      .catch(err => console.error("Failed to load points:", err));

    // Load Image to determine Canvas Dimensions
    const img = new Image();
    img.src = getAssetPath('image/base-map.png');
    img.onload = () => {
      setMapConfig({
        width: img.naturalWidth,
        height: img.naturalHeight,
        loaded: true
      });
      // Center the map initially
      setPan({ x: -img.naturalWidth / 4, y: -img.naturalHeight / 4 });
    };
    img.onerror = () => console.error("Failed to load base map image");
  }, []);

  // --- Lifecycle: Load Text Content ---
  useEffect(() => {
    if (!selectedId) {
      setActiveContent(null);
      return;
    }

    const point = points.find(p => p.id === selectedId);
    if (point && point.file) {
      setActiveContent(null); // Clear previous content
      fetch(getAssetPath(`texts/${point.file}`))
        .then(res => {
            if (!res.ok) throw new Error("File not found");
            return res.text();
        })
        .then(text => setActiveContent(text))
        .catch(err => {
          console.error("Error loading text:", err);
          setActiveContent(`# Error\nUnable to load data from **${point.file}**.`);
        });
    }
  }, [selectedId, points]);

  // --- Logic: Clamp Pan to Viewport ---
  const getClampedPan = (newPanX, newPanY, currentScale) => {
    if (!containerRef.current || !mapConfig.loaded) return { x: newPanX, y: newPanY };

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    
    const scaledMapWidth = mapConfig.width * currentScale;
    const scaledMapHeight = mapConfig.height * currentScale;

    let finalX = newPanX;
    let finalY = newPanY;

    // Clamp X
    if (scaledMapWidth < containerWidth) {
       // Center if smaller than screen
       finalX = (containerWidth - scaledMapWidth) / 2;
    } else {
       // Prevent dragging edges past screen bounds
       const minX = containerWidth - scaledMapWidth;
       const maxX = 0;
       finalX = Math.min(Math.max(newPanX, minX), maxX);
    }

    // Clamp Y
    if (scaledMapHeight < containerHeight) {
       finalY = (containerHeight - scaledMapHeight) / 2;
    } else {
       const minY = containerHeight - scaledMapHeight;
       const maxY = 0;
       finalY = Math.min(Math.max(newPanY, minY), maxY);
    }

    return { x: finalX, y: finalY };
  };

  // --- Handlers: Dragging ---
  const handlePointerDown = (e) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const rawX = panStartRef.current.x + dx;
    const rawY = panStartRef.current.y + dy;
    setPan(getClampedPan(rawX, rawY, scale));
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  // --- Handlers: Click & Selection ---
  const handleBoxClick = (e, point) => {
    // Calculate distance moved to differentiate Click vs Drag
    const dist = Math.sqrt(
      Math.pow(e.clientX - dragStartRef.current.x, 2) + 
      Math.pow(e.clientY - dragStartRef.current.y, 2)
    );
    
    if (dist < 5) {
        focusOnPoint(point);
    }
  };

  // --- Handlers: Zoom ---
  const handleZoom = (delta, clientX, clientY) => {
    if (!containerRef.current || !mapConfig.loaded) return;
    
    // Clamp zoom level (0.1x to 4x)
    const newScale = Math.min(Math.max(scale + delta, 0.2), 2);
    if (newScale === scale) return;

    const rect = containerRef.current.getBoundingClientRect();
    // Focus point (mouse position or screen center)
    const focalX = clientX !== undefined ? clientX - rect.left : rect.width / 2;
    const focalY = clientY !== undefined ? clientY - rect.top : rect.height / 2;

    // Project focal point to world coordinates
    const worldX = (focalX - pan.x) / scale;
    const worldY = (focalY - pan.y) / scale;

    // Calculate new pan to maintain focus
    const rawPanX = focalX - (worldX * newScale);
    const rawPanY = focalY - (worldY * newScale);

    setScale(newScale);
    setPan(getClampedPan(rawPanX, rawPanY, newScale));
  };

  const handleWheel = (e) => {
    // Normalize wheel delta
    const zoomSensitivity = 0.1;
    const delta = e.deltaY < 0 ? zoomSensitivity : -zoomSensitivity;
    handleZoom(delta, e.clientX, e.clientY);
  };

  // --- Core Logic: Focus Camera ---
  const focusOnPoint = (pointOrId) => {
    const point = typeof pointOrId === 'number' 
      ? points.find(p => p.id === pointOrId)
      : pointOrId;

    if (!point || !containerRef.current) return;

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // Target position on screen (Left-Center visually)
    let targetScreenX = containerWidth * 0.30;
    let targetScreenY = containerHeight * 0.50;

    if (window.innerWidth < 768) {
        targetScreenX = containerWidth * 0.5;
        targetScreenY = containerHeight * 0.3;
    }

    // Calculate center of the target box
    const centerX = point.x + (point.width / 2);
    const centerY = point.y + (point.height / 2);

    const rawPanX = targetScreenX - (centerX * scale);
    const rawPanY = targetScreenY - (centerY * scale);

    setPan(getClampedPan(rawPanX, rawPanY, scale));
    setSelectedId(point.id);
  };

  const closePanel = () => setSelectedId(null);

  // --- Render: Loading State ---
  if (!mapConfig.loaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-indigo-400">
        <div className="flex flex-col items-center gap-4">
            <Loader className="animate-spin" size={48} />
            <p className="text-lg tracking-widest uppercase">Initializing Sector...</p>
        </div>
      </div>
    );
  }

  // --- Render: Main UI ---
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-900 font-sans text-gray-100">
      
      {/* --- Canvas Area --- */}
      <div 
        ref={containerRef}
        className="relative flex-1 cursor-grab active:cursor-grabbing touch-none overflow-hidden bg-slate-900"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
        {/* Movable Layer */}
        <div 
          className={`absolute top-0 left-0 origin-top-left will-change-transform ${!isDragging ? 'transition-transform duration-700 cubic-bezier(0.25, 1, 0.5, 1)' : ''}`}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
            width: mapConfig.width,
            height: mapConfig.height,
          }}
        >
          {/* The Map Image */}
          <img 
            src={getAssetPath('image/base-map.png')}
            alt="World Map"
            className="absolute inset-0 pointer-events-none select-none w-full h-full object-contain"
            draggable={false}
          />

          {/* Interactive Zones (Transparent Boxes) */}
          {points.map((point) => (
            <div
              key={point.id}
              className={`absolute border-2 border-transparent hover:border-indigo-400/50 hover:bg-indigo-500/10 transition-colors cursor-pointer z-10
                ${selectedId === point.id ? 'border-indigo-500 bg-indigo-500/20' : ''}
              `}
              style={{ 
                left: point.x, 
                top: point.y,
                width: point.width,
                height: point.height
              }}
              onPointerDown={(e) => { dragStartRef.current = { x: e.clientX, y: e.clientY }; }}
              onPointerUp={(e) => handleBoxClick(e, point)}
              title={point.title}
            />
          ))}
        </div>

        {/* Floating UI Controls */}
        <div className="absolute top-6 left-6 z-40 flex flex-col gap-4 pointer-events-none">
           <div className="bg-slate-900/90 backdrop-blur text-white p-4 rounded-lg shadow-lg border border-slate-700 max-w-xs pointer-events-auto">
              <h1 className="text-xl font-bold flex items-center gap-2"><Map className="text-indigo-400"/> Interactive Canvas</h1>
              <p className="text-slate-400 text-sm mt-1">Drag to explore. Click highlighted areas.</p>
           </div>
           <div className="flex flex-col bg-slate-900/90 backdrop-blur border border-slate-700 rounded-lg shadow-lg overflow-hidden pointer-events-auto w-10">
              <button
                onClick={() => handleZoom(0.2)}
                className="p-2 bg-slate-900 border border-black hover:bg-slate-700 text-white active:bg-indigo-600 transition-colors"
                title="Zoom In"
              >
                <ZoomIn size={20} />
              </button>

              <div className="text-xs text-center py-1 text-slate-500 select-none">
                {Math.round(scale * 100)}%
              </div>

              <button
                onClick={() => handleZoom(-0.2)}
                className="p-2 bg-slate-900 border border-black hover:bg-slate-700 text-white active:bg-indigo-600 transition-colors"
                title="Zoom Out"
              >
                <ZoomOut size={20} />
              </button>
            </div>

           {/* <div className="flex flex-col bg-slate-900/90 backdrop-blur border border-slate-700 rounded-lg shadow-lg overflow-hidden pointer-events-auto w-10">
              <button onClick={() => handleZoom(0.2)} className="p-2 hover:bg-slate-700 text-white border-b border-slate-700 active:bg-indigo-600 transition-colors" title="Zoom In"><ZoomIn size={20} /></button>
              <div className="text-xs text-center py-1 text-slate-500 select-none">{Math.round(scale * 100)}%</div>
              <button onClick={() => handleZoom(-0.2)} className="p-2 hover:bg-slate-700 text-white active:bg-indigo-600 transition-colors" title="Zoom Out"><ZoomOut size={20} /></button>
           </div> */}
        </div>
      </div>

      {/* --- Side Detail Panel --- */}
      <div className={`absolute right-0 top-0 h-full w-full md:w-[400px] bg-slate-900/95 backdrop-blur-md border-l border-slate-700 shadow-2xl z-50 transform transition-transform duration-500 ease-in-out ${selectedId ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedId ? (
          <div className="flex flex-col h-full relative">
            <div className="absolute top-0 right-0 p-4 z-10 bg-gradient-to-b from-slate-900 to-transparent w-full flex justify-end">
               <button onClick={closePanel} className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition-colors shadow-lg"><X size={20} /></button>
            </div>

            <div className="p-8 pt-12 overflow-y-auto custom-scrollbar h-full">
              <MarkdownRenderer content={activeContent} onLinkClick={focusOnPoint} />
              
              <div className="mt-12 pt-6 border-t border-slate-800">
                <button className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                  Initiate Travel <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

    </div>
  );
}