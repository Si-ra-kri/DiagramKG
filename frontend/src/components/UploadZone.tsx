import { useCallback, useRef, useState } from 'react';

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  isUploading: boolean;
  uploadProgress: number;
}

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function UploadZone({ onFileSelected, isUploading, uploadProgress }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!ACCEPTED.includes(file.type)) return;
      onFileSelected(file);
    },
    [onFileSelected],
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const onDragLeave = () => setIsDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <div
      onClick={() => !isUploading && inputRef.current?.click()}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`
        relative flex flex-col items-center justify-center gap-3
        rounded-2xl border-2 border-dashed p-8 cursor-pointer
        transition-all duration-300 min-h-36
        ${isDragOver
          ? 'border-indigo-400 bg-indigo-500/10 scale-[1.01]'
          : 'border-slate-600 hover:border-indigo-500/60 hover:bg-indigo-500/5'
        }
        ${isUploading ? 'pointer-events-none' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        onChange={onChange}
        className="hidden"
        id="diagram-upload-input"
      />

      {isUploading ? (
        <div className="flex flex-col items-center gap-3 w-full">
          {/* Spinner */}
          <svg className="w-8 h-8 text-indigo-400 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {/* Progress bar */}
          <div className="w-full max-w-xs">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Uploading & extracting graph…</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Upload icon */}
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20
            flex items-center justify-center">
            <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-300">
              {isDragOver ? 'Drop your diagram here' : 'Upload a diagram'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Drag & drop or click — PNG, JPG, WebP, GIF
            </p>
          </div>
        </>
      )}
    </div>
  );
}
