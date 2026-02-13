import { useState, useCallback } from "react";
import { Card, CardContent } from "@valet/ui/components/card";
import { Upload, FileText, Check, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface ResumeUploadProps {
  onUploadComplete: (file: File, resumeId: string) => void;
}

export function ResumeUpload({ onUploadComplete }: ResumeUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadResume = api.resumes.upload.useMutation({
    onSuccess: (data) => {
      if (data.status === 202 && uploadedFile) {
        toast.success("Resume uploaded successfully.");
        onUploadComplete(uploadedFile, data.body.id);
      }
    },
    onError: () => {
      toast.error("Resume upload failed. Please try again.");
      setUploadError("Upload failed. Please try again.");
    },
  });

  const isUploading = uploadResume.isPending;

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && isValidFile(file)) {
        processFile(file);
      }
    },
    []
  );

  function isValidFile(file: File): boolean {
    const validTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    return validTypes.includes(file.type) && file.size <= 10 * 1024 * 1024;
  }

  function processFile(file: File) {
    setUploadedFile(file);
    setUploadError(null);
    uploadResume.mutate({
      body: { file },
    });
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && isValidFile(file)) {
      processFile(file);
    }
  }

  if (uploadedFile && !isUploading && !uploadError) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-[var(--wk-status-success)]">
              <Check className="h-6 w-6" />
            </div>
          </div>
          <div>
            <p className="font-medium">{uploadedFile.name}</p>
            <p className="text-sm text-[var(--wk-text-secondary)]">
              Resume uploaded successfully
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardContent className="p-8 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="font-display text-xl font-semibold">
            Upload Your Resume
          </h2>
          <p className="text-sm text-[var(--wk-text-secondary)]">
            This is all we need to get started.
          </p>
        </div>

        <label
          className={cn(
            "flex flex-col items-center justify-center gap-3 p-8",
            "border-2 border-dashed rounded-[var(--wk-radius-lg)] cursor-pointer",
            "transition-colors duration-[var(--wk-duration-fast)]",
            isDragging
              ? "border-[var(--wk-copilot)] bg-blue-50"
              : "border-[var(--wk-border-default)] hover:border-[var(--wk-border-strong)]"
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".pdf,.docx"
            onChange={handleFileSelect}
            className="hidden"
          />
          {isUploading ? (
            <>
              <FileText className="h-10 w-10 text-[var(--wk-copilot)] animate-pulse" />
              <p className="text-sm text-[var(--wk-text-secondary)]">
                Uploading...
              </p>
            </>
          ) : (
            <>
              <Upload className="h-10 w-10 text-[var(--wk-text-tertiary)]" />
              <div className="text-center">
                <p className="text-sm font-medium">
                  Drag and drop your resume here
                </p>
                <p className="text-xs text-[var(--wk-text-tertiary)]">
                  or click to browse
                </p>
              </div>
              <p className="text-xs text-[var(--wk-text-tertiary)]">
                PDF or DOCX, max 10MB
              </p>
            </>
          )}
        </label>

        {uploadError && (
          <p className="text-sm text-center text-[var(--wk-status-error)]">
            {uploadError}
          </p>
        )}

        <div className="flex items-center gap-2 justify-center text-sm text-[var(--wk-text-secondary)]">
          <Clock className="h-4 w-4" />
          <span>
            You'll be applying to your first job in about 2 minutes.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
