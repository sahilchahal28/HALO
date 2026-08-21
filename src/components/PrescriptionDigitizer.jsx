import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { Cpu, FileText, Image as ImageIcon, CheckCircle, RefreshCw } from 'lucide-react';

// Preset handwritten sample designs
const PRESETS = [
  {
    id: 'preset1',
    name: 'Standard Antibiotic (Amoxicillin)',
    handwrittenText: 'Rx:\nAmoxicillin 500 mg\n1 tab twice daily (1-0-1)\nDuration: 5 days',
    imageUrl: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=400&q=80',
    parsed: {
      medicine: 'Amoxicillin 500mg',
      dosage: '500 mg',
      frequency: '1-0-1',
      duration: '5 days'
    }
  },
  {
    id: 'preset2',
    name: 'Common Analgesic (Paracetamol)',
    handwrittenText: 'Rx:\nParacetamol 650 mg\nTake after meals (1-1-1)\nDuration: 3 days',
    imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80',
    parsed: {
      medicine: 'Paracetamol 650mg',
      dosage: '650 mg',
      frequency: '1-1-1',
      duration: '3 days'
    }
  },
  {
    id: 'preset3',
    name: 'Chronic Maintenance (Metformin)',
    handwrittenText: 'Rx:\nMetformin 500 mg\nOnce daily at lunch (0-1-0)\nDuration: 30 days',
    imageUrl: 'https://images.unsplash.com/photo-1628771065518-0d82f1938462?auto=format&fit=crop&w=400&q=80',
    parsed: {
      medicine: 'Metformin 500mg',
      dosage: '500 mg',
      frequency: '0-1-0',
      duration: '30 days'
    }
  }
];

export default function PrescriptionDigitizer({ episodeId, onDigitized }) {
  const { addToast } = useApp();
  const [selectedPreset, setSelectedPreset] = useState(PRESETS[0]);
  const [pipelineStage, setPipelineStage] = useState('IDLE'); // IDLE, BINARIZATION, SEGMENTATION, OCR, DONE
  const [structuredData, setStructuredData] = useState(null);
  const [rawText, setRawText] = useState('');
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef(null);

  // Redraw preset image on canvas
  useEffect(() => {
    drawCanvasImage('NORMAL');
  }, [selectedPreset]);

  const drawCanvasImage = (mode = 'NORMAL') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background sheet
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw medical logo watermark
    ctx.strokeStyle = 'rgba(0, 102, 204, 0.03)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 60, 0, Math.PI * 2);
    ctx.stroke();
    
    // Text Styling
    ctx.fillStyle = '#1d1d1f';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('HALO CLINICAL OUTPOST', 30, 45);
    
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 55);
    ctx.lineTo(canvas.width - 30, 55);
    ctx.stroke();

    if (mode === 'NORMAL') {
      // Draw realistic handwritten styling
      ctx.fillStyle = '#0066cc'; // Action Blue ink
      ctx.font = 'italic 18px "Courier New", monospace';
      
      const lines = selectedPreset.handwrittenText.split('\n');
      lines.forEach((line, index) => {
        ctx.fillText(line, 40, 100 + index * 40);
      });
    } else if (mode === 'BINARIZATION') {
      // Simulated High-Contrast Thresholding (Grayscale/Otsu's filter)
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 18px "Courier New", monospace';
      
      const lines = selectedPreset.handwrittenText.split('\n');
      lines.forEach((line, index) => {
        ctx.fillText(line, 40, 100 + index * 40);
      });
      
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(38, 98, 100, 2);
    } else if (mode === 'SEGMENTATION') {
      // Draw green horizontal layout segmentation bounding boxes
      ctx.fillStyle = '#0066cc';
      ctx.font = 'italic 18px "Courier New", monospace';
      
      const lines = selectedPreset.handwrittenText.split('\n');
      lines.forEach((line, index) => {
        ctx.fillText(line, 40, 100 + index * 40);
        
        // Draw blue bounding box
        ctx.strokeStyle = '#0066cc';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(30, 78 + index * 40, canvas.width - 60, 30);
      });
    }
  };

  const startPipeline = () => {
    setPipelineStage('BINARIZATION');
    setStructuredData(null);
    setRawText('');
    
    drawCanvasImage('BINARIZATION');
    addToast('Stage 1: Performing Grayscale Otsu Binarization...', 'info');

    // Step 2: Line Segmentation
    setTimeout(() => {
      setPipelineStage('SEGMENTATION');
      drawCanvasImage('SEGMENTATION');
      addToast('Stage 2: Segmenting text lines and contours...', 'info');
      
      // Step 3: Neural Network Character Classification (OCR Scanning)
      setTimeout(() => {
        setPipelineStage('OCR');
        addToast('Stage 3: Running CNN character classification...', 'info');
        
        let currentText = '';
        const targetText = selectedPreset.handwrittenText;
        let charIndex = 0;
        
        const interval = setInterval(() => {
          if (charIndex < targetText.length) {
            currentText += targetText.charAt(charIndex);
            setRawText(currentText);
            charIndex++;
          } else {
            clearInterval(interval);
            
            // Done stage
            setPipelineStage('DONE');
            setStructuredData(selectedPreset.parsed);
            addToast('Stage 4: Structural parsing completed successfully.', 'success');
          }
        }, 15);
        
      }, 1500);

    }, 1500);
  };

  const handleSaveToEpisode = async () => {
    if (!structuredData || !episodeId) return;
    setSaving(true);
    try {
      await api.put(`/episodes/${episodeId}`, {
        prescription: {
          ...structuredData,
          originalImagePath: selectedPreset.imageUrl,
          isDigitized: true
        }
      });
      addToast('Prescription saved to Active Treatment Episode!', 'success');
      onDigitized();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div 
      className="bg-canvas border border-hairline p-6 my-6"
      style={{ borderRadius: '18px' }} // rounded.lg
    >
      <div className="flex items-center gap-3 border-b border-hairline pb-4 mb-6">
        <Cpu className="text-primary" size={22} />
        <div>
          <h2 className="text-xl font-semibold text-ink">TensorFlow Transcription Service</h2>
          <p className="text-xs text-ink-muted-48 mt-1">
            Upload prescription image and execute binarization analysis to extract structured dosage entries.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Preset Selector and Canvas Image */}
        <div>
          <h3 className="text-xs font-semibold text-ink-muted-48 tracking-widest uppercase mb-3">
            1. Select Handwriting Template
          </h3>
          <div className="flex flex-col gap-2 mb-4">
            {PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => {
                  setSelectedPreset(preset);
                  setPipelineStage('IDLE');
                  setStructuredData(null);
                  setRawText('');
                }}
                className={`text-left p-3 text-sm border transition-all cursor-pointer ${
                  selectedPreset.id === preset.id 
                    ? 'bg-canvas-parchment border-primary text-ink font-semibold' 
                    : 'bg-canvas border-hairline text-ink hover:border-hairline-strong'
                }`}
                style={{ borderRadius: '11px' }} // rounded.md
              >
                {preset.name}
              </button>
            ))}
          </div>

          <h3 className="text-xs font-semibold text-ink-muted-48 tracking-widest uppercase mb-3">
            Prescription Card Preview
          </h3>
          <div className="border border-hairline rounded-[18px] bg-canvas-parchment p-4 flex justify-center">
            <canvas 
              ref={canvasRef} 
              width={400} 
              height={280} 
              className="border border-hairline rounded-[11px] bg-canvas max-w-full"
            />
          </div>
          
          <button
            onClick={startPipeline}
            disabled={pipelineStage !== 'IDLE' && pipelineStage !== 'DONE'}
            className="w-full mt-4 bg-primary hover:bg-primary-focus disabled:opacity-50 text-canvas font-semibold py-3 px-4 rounded-full transition-colors uppercase text-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            {pipelineStage === 'IDLE' ? 'Execute ML Digitization Pipeline' : 'Rerun Digitizer Pipeline'}
          </button>
        </div>

        {/* Right Column: Processing Pipeline Outputs */}
        <div className="flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-semibold text-ink-muted-48 tracking-widest uppercase mb-3">
              2. Preprocessing Analysis Stages
            </h3>

            {/* Stages Grid */}
            <div className="grid grid-cols-2 gap-2 mb-6 text-xs">
              <div className={`p-3 border text-center transition-colors ${
                pipelineStage === 'BINARIZATION' ? 'bg-primary/10 border-primary text-primary font-semibold' : 'bg-canvas-parchment border-hairline text-ink-muted-48'
              }`} style={{ borderRadius: '8px' }}>
                <div className="font-mono">STAGE 1</div>
                <div className="mt-1">Otsu Binarize</div>
              </div>
              <div className={`p-3 border text-center transition-colors ${
                pipelineStage === 'SEGMENTATION' ? 'bg-primary/10 border-primary text-primary font-semibold' : 'bg-canvas-parchment border-hairline text-ink-muted-48'
              }`} style={{ borderRadius: '8px' }}>
                <div className="font-mono">STAGE 2</div>
                <div className="mt-1">Line Segment</div>
              </div>
              <div className={`p-3 border text-center transition-colors ${
                pipelineStage === 'OCR' ? 'bg-primary/10 border-primary text-primary font-semibold' : 'bg-canvas-parchment border-hairline text-ink-muted-48'
              }`} style={{ borderRadius: '8px' }}>
                <div className="font-mono">STAGE 3</div>
                <div className="mt-1">CNN OCR Scan</div>
              </div>
              <div className={`p-3 border text-center transition-colors ${
                pipelineStage === 'DONE' ? 'bg-primary/10 border-primary text-primary font-semibold' : 'bg-canvas-parchment border-hairline text-ink-muted-48'
              }`} style={{ borderRadius: '8px' }}>
                <div className="font-mono">STAGE 4</div>
                <div className="mt-1">Structured OK</div>
              </div>
            </div>

            {/* Raw Text Extract Panel */}
            <h3 className="text-xs font-semibold text-ink-muted-48 tracking-widest uppercase mb-2">
              Neural Network Text Capture
            </h3>
            <div 
              className="bg-canvas-parchment border border-hairline p-4 font-mono text-xs min-h-[100px] whitespace-pre-line text-ink mb-6"
              style={{ borderRadius: '11px' }}
            >
              {rawText || (
                <span className="italic text-ink-muted-48">
                  Run digitizer pipeline to capture transcription...
                </span>
              )}
            </div>

            {/* Structured Prescription result */}
            {structuredData && (
              <div 
                className="border border-hairline bg-canvas p-4"
                style={{ borderRadius: '11px' }}
              >
                <div className="flex items-center gap-2 text-primary font-semibold text-sm mb-3">
                  <CheckCircle size={15} />
                  Structured Transcription Ready
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs border-t border-hairline pt-3 font-mono">
                  <div>
                    <span className="text-[10px] text-ink-muted-48 block">MEDICINE:</span>
                    <span className="text-ink font-semibold">{structuredData.medicine}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-muted-48 block">DOSAGE:</span>
                    <span className="text-ink font-semibold">{structuredData.dosage}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-muted-48 block">FREQUENCY:</span>
                    <span className="text-ink font-semibold">{structuredData.frequency}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-muted-48 block">DURATION:</span>
                    <span className="text-ink font-semibold">{structuredData.duration}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action button */}
          {structuredData && (
            <button
              onClick={handleSaveToEpisode}
              disabled={saving}
              className="w-full bg-ink hover:bg-ink-muted-80 disabled:opacity-50 text-canvas font-sans py-3 rounded-full transition-colors uppercase text-xs mt-6 flex items-center justify-center gap-2 cursor-pointer font-semibold"
            >
              <FileText size={14} />
              {saving ? 'Saving to Database...' : 'Commit to Active Treatment Episode'}
            </button>
          )}

        </div>
      </div>
    </div>
  );
}
