import React, { useState, useRef, useEffect } from 'react';
import { Map, X, Info, Navigation, Star, ChevronRight, MapPin, ZoomIn, ZoomOut } from 'lucide-react';

// --- Mock Data with Markdown Content ---
const MAP_WIDTH = 3000;
const MAP_HEIGHT = 2000;

// NOTE: 'content' now accepts Markdown + [[id|label]] links
const POINTS_OF_INTEREST = [
  { 
    id: 1, 
    x: 800, 
    y: 600, 
    title: "The Azure Citadel", // Kept for tooltip
    content: `
# The Azure Citadel
**Status:** Active Fortress  
**Coordinates:** Sector 7-A

A towering stronghold built of blue stone. It maintains a tense peace with [[4|Port Helios]] to the south.

## Strategic Importance
* Controls the northern pass
* Houses the *Grand Library of Tides*
* Primary defensive ward generator

> "The walls have never been breached, only bargained with."
    `
  },
  { 
    id: 2, 
    x: 1500, 
    y: 1000, 
    title: "Market of Whispers",
    content: `
# Market of Whispers
**Type:** Black Market Hub

Located in the center of the desert. Traders here often refuse gold, preferring to trade in secrets from the [[1|Azure Citadel]] or rare prototypes stolen from [[5|Ironforge Station]].

## Notable Goods
- Cursed artifacts
- Water from the Moon Well
- **Information** (High Price)
    `
  },
  { 
    id: 3, 
    x: 2200, 
    y: 400, 
    title: "Echo Canyon", 
    content: `
# Echo Canyon
**Danger Level:** Moderate

A natural phenomenon where sounds circle for hours. The Wind Monks here claim they can hear conversations from the [[6|Lunar Observatory]] due to strange acoustic anomalies.

*Travelers are advised to wear earplugs to avoid madness.*
    `
  },
  { 
    id: 4, 
    x: 400, 
    y: 1500, 
    title: "Port Helios", 
    content: `
# Port Helios
**Population:** 2.5 Million

The city that never sleeps. Its economy is entirely dependent on the raw ore extracted from the mines near [[5|Ironforge Station]].

## Districts
1. Sun Harbor
2. The Crystal Ward
3. Undertown
    `
  },
  { 
    id: 5, 
    x: 2400, 
    y: 1600, 
    title: "Ironforge Station", 
    content: `
# Ironforge Station
**Output:** 90% of Sector Energy

A massive industrial complex. The smoke from its stacks is often visible from [[2|Market of Whispers]], much to the annoyance of the desert nomads.

## Facilities
- Smelting Pits
- Airship Docks
- Experimental Labs
    `
  },
  { 
    id: 6, 
    x: 1200, 
    y: 200, 
    title: "Lunar Observatory", 
    content: `
# Lunar Observatory
**Elevation:** 12,000ft

Perched on the highest peak. Scholars here frequently send encrypted light-signals to [[1|The Azure Citadel]] regarding celestial omens.

> "Look up, and see what is looking back."
    `
  },
];

// --- Simple Markdown Parser Component ---
const MarkdownRenderer = ({ content, onLinkClick }) => {
  // Split by newlines to handle block elements
  const lines = content.trim().split('\n');

  const parseInline = (text) => {
    // 1. Handle Custom Links [[id|label]]
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

      // 2. Handle Bold **text**
      const boldParts = part.split(/(\*\*.*?\*\*)/g);
      return boldParts.map((bPart, j) => {
        if (bPart.startsWith('**') && bPart.endsWith('**')) {
          return <strong key={`${i}-${j}`} className="text-white font-bold">{bPart.slice(2, -2)}</strong>;
        }

        // 3. Handle Italic *text*
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

        // Headers
        if (trimmed.startsWith('# ')) 
          return <h1 key={index} className="text-3xl font-bold text-white mt-6 mb-4 pb-2 border-b border-slate-700">{parseInline(trimmed.slice(2))}</h1>;
        if (trimmed.startsWith('## ')) 
          return <h2 key={index} className="text-xl font-semibold text-indigo-100 mt-6 mb-2">{parseInline(trimmed.slice(3))}</h2>;
        
        // Blockquotes
        if (trimmed.startsWith('> '))
          return <blockquote key={index} className="border-l-4 border-indigo-500 pl-4 italic text-slate-400 my-4">{parseInline(trimmed.slice(2))}</blockquote>;

        // Lists
        if (trimmed.startsWith('- ') || trimmed.startsWith('* '))
          return (
            <div key={index} className="flex items-start gap-2 ml-2">
              <span className="text-indigo-500 mt-1.5">•</span>
              <span>{parseInline(trimmed.slice(2))}</span>
            </div>
          );

        // Standard Paragraph
        return <p key={index}>{parseInline(trimmed)}</p>;
      })}
    </div>
  );
};

export default function CanvasMap() {
  // --- State ---
  const [pan, setPan] = useState({ x: -500, y: -300 });
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // --- Clamping Helper ---
  // Ensures the view never leaves the boundaries of the map
  const getClampedPan = (newPanX, newPanY, currentScale) => {
    if (!containerRef.current) return { x: newPanX, y: newPanY };

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    
    // Dimensions of the map at the current scale
    const scaledMapWidth = MAP_WIDTH * currentScale;
    const scaledMapHeight = MAP_HEIGHT * currentScale;

    let finalX = newPanX;
    let finalY = newPanY;

    // Clamp X
    if (scaledMapWidth < containerWidth) {
       // If zoomed out such that map is smaller than screen, center it
       finalX = (containerWidth - scaledMapWidth) / 2;
    } else {
       // Standard panning: Don't let left edge go right of 0, don't let right edge go left of screen width
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

  // --- Event Handlers ---
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

    // Apply clamp
    setPan(getClampedPan(rawX, rawY, scale));
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  const handleMarkerClick = (e, point) => {
    const dist = Math.sqrt(Math.pow(e.clientX - dragStartRef.current.x, 2) + Math.pow(e.clientY - dragStartRef.current.y, 2));
    if (dist < 5) focusOnPoint(point);
  };

  const handleZoom = (delta, clientX, clientY) => {
    if (!containerRef.current) return;
    const newScale = Math.min(Math.max(scale + delta, 0.5), 4);
    if (newScale === scale) return;

    const rect = containerRef.current.getBoundingClientRect();
    const focalX = clientX !== undefined ? clientX - rect.left : rect.width / 2;
    const focalY = clientY !== undefined ? clientY - rect.top : rect.height / 2;

    const worldX = (focalX - pan.x) / scale;
    const worldY = (focalY - pan.y) / scale;

    // Calculate intended new pan
    const rawPanX = focalX - (worldX * newScale);
    const rawPanY = focalY - (worldY * newScale);

    setScale(newScale);
    
    // Apply clamp with the NEW scale
    setPan(getClampedPan(rawPanX, rawPanY, newScale));
  };

  const handleWheel = (e) => {
    const zoomSensitivity = 0.1;
    const delta = e.deltaY < 0 ? zoomSensitivity : -zoomSensitivity;
    handleZoom(delta, e.clientX, e.clientY);
  };

  const focusOnPoint = (pointOrId) => {
    const point = typeof pointOrId === 'number' 
      ? POINTS_OF_INTEREST.find(p => p.id === pointOrId)
      : pointOrId;

    if (!point || !containerRef.current) return;

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    let targetScreenX = containerWidth * 0.30;
    let targetScreenY = containerHeight * 0.50;

    if (window.innerWidth < 768) {
        targetScreenX = containerWidth * 0.5;
        targetScreenY = containerHeight * 0.3;
    }

    const rawPanX = targetScreenX - (point.x * scale);
    const rawPanY = targetScreenY - (point.y * scale);

    // Apply clamp
    setPan(getClampedPan(rawPanX, rawPanY, scale));
    setSelectedId(point.id);
  };

  const closePanel = () => setSelectedId(null);
  const activePoint = POINTS_OF_INTEREST.find(p => p.id === selectedId);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-900 font-sans text-gray-100">
      
      <div 
        ref={containerRef}
        className="relative flex-1 cursor-grab active:cursor-grabbing touch-none overflow-hidden bg-slate-900"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
        <div 
          className={`absolute top-0 left-0 origin-top-left will-change-transform ${!isDragging ? 'transition-transform duration-700 cubic-bezier(0.25, 1, 0.5, 1)' : ''}`}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
            width: MAP_WIDTH,
            height: MAP_HEIGHT,
          }}
        >
          <div className="absolute inset-0 bg-slate-800 border-4 border-slate-700 rounded-xl shadow-2xl overflow-hidden">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
            <div className="absolute top-[20%] left-[10%] w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-[30%] right-[20%] w-[800px] h-[800px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-10 right-10 text-slate-600 text-9xl font-bold opacity-20 select-none pointer-events-none scale-100">SECTOR 7</div>
          </div>

          {POINTS_OF_INTEREST.map((point) => (
            <div
              key={point.id}
              className="absolute group"
              style={{ left: point.x, top: point.y, transform: 'translate(-50%, -50%)' }}
              onPointerDown={(e) => { dragStartRef.current = { x: e.clientX, y: e.clientY }; }}
              onPointerUp={(e) => handleMarkerClick(e, point)}
            >
              {selectedId !== point.id && <div className="absolute inset-0 rounded-full bg-indigo-500 opacity-75 animate-ping"></div>}
              <button 
                className={`relative flex items-center justify-center w-12 h-12 rounded-full shadow-lg border-2 transition-all duration-300 
                  ${selectedId === point.id ? 'bg-white border-indigo-600 text-indigo-600 scale-125 z-50' : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:scale-110 z-10'}`}
              >
                 {selectedId === point.id ? <MapPin size={24} fill="currentColor" /> : <point.iconType />}
              </button>
              <div className={`absolute top-14 left-1/2 transform -translate-x-1/2 whitespace-nowrap bg-black/80 px-3 py-1 rounded text-xs font-bold tracking-wider transition-opacity duration-300 pointer-events-none ${selectedId === point.id ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
                {point.title.toUpperCase()}
              </div>
            </div>
          ))}
        </div>

        <div className="absolute top-6 left-6 z-40 flex flex-col gap-4 pointer-events-none">
           <div className="bg-slate-900/90 backdrop-blur text-white p-4 rounded-lg shadow-lg border border-slate-700 max-w-xs pointer-events-auto">
              <h1 className="text-xl font-bold flex items-center gap-2"><Map className="text-indigo-400"/> Interactive Canvas</h1>
              <p className="text-slate-400 text-sm mt-1">Drag to explore. Scroll to Zoom.</p>
           </div>
           <div className="flex flex-col bg-slate-900/90 backdrop-blur border border-slate-700 rounded-lg shadow-lg overflow-hidden pointer-events-auto w-10">
              <button onClick={() => handleZoom(0.2)} className="p-2 hover:bg-slate-700 text-white border-b border-slate-700 active:bg-indigo-600 transition-colors" title="Zoom In"><ZoomIn size={20} /></button>
              <div className="text-xs text-center py-1 text-slate-500 select-none">{Math.round(scale * 100)}%</div>
              <button onClick={() => handleZoom(-0.2)} className="p-2 hover:bg-slate-700 text-white active:bg-indigo-600 transition-colors" title="Zoom Out"><ZoomOut size={20} /></button>
           </div>
        </div>
      </div>

      {/* --- Markdown Side Panel --- */}
      <div className={`absolute right-0 top-0 h-full w-full md:w-[400px] bg-slate-900/95 backdrop-blur-md border-l border-slate-700 shadow-2xl z-50 transform transition-transform duration-500 ease-in-out ${selectedId ? 'translate-x-0' : 'translate-x-full'}`}>
        {activePoint ? (
          <div className="flex flex-col h-full relative">
            {/* Panel Header Actions */}
            <div className="absolute top-0 right-0 p-4 z-10 bg-gradient-to-b from-slate-900 to-transparent w-full flex justify-end">
               <button onClick={closePanel} className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition-colors shadow-lg"><X size={20} /></button>
            </div>

            {/* Scrollable Content */}
            <div className="p-8 pt-12 overflow-y-auto custom-scrollbar h-full">
              <MarkdownRenderer content={activePoint.content} onLinkClick={focusOnPoint} />
              
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

// Icon Mapping
Object.assign(POINTS_OF_INTEREST[0], { iconType: () => <Navigation size={24} /> });
Object.assign(POINTS_OF_INTEREST[1], { iconType: () => <Star size={24} /> });
Object.assign(POINTS_OF_INTEREST[2], { iconType: () => <Info size={24} /> });
Object.assign(POINTS_OF_INTEREST[3], { iconType: () => <Navigation size={24} /> });
Object.assign(POINTS_OF_INTEREST[4], { iconType: () => <Star size={24} /> });
Object.assign(POINTS_OF_INTEREST[5], { iconType: () => <Info size={24} /> });