import { api } from './api';
import { parseCVText } from './gemini';

// Extracts text from raw bytes using an approach similar to extractTextFromPDF
export async function downloadAndParseGoogleDriveCV(file: any, apiKey: string) {
  // Download the file
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`);
  if (!response.ok) throw new Error('Failed to download from Google Drive');
  
  const blob = await response.blob();
  const fileObj = new File([blob], file.name, { type: file.mimeType });
  
  // Use extractTextFromPDF via existing api.ts logic (assumes PDF since that's what API handles best currently)
  // Assuming extractTextFromPDF from api handles File
  const { extractTextFromPDF } = await import('./api');
  try {
    const text = await extractTextFromPDF(fileObj);
    const combinedText = `--- DOC: ${file.name} ---\n${text}\n\n`;
    const parsedExperts = await parseCVText(combinedText);
    
    if (parsedExperts && parsedExperts.length > 0) {
      await api.saveExperts(parsedExperts);
      return parsedExperts;
    }
  } catch (err) {
    console.error("Error extracting text from Google Drive file:", file.name, err);
  }
  return null;
}

export async function syncGoogleDriveInBackground(addTask: any, updateTask: any) {
  const config = await api.getGoogleDriveSettings();
  if (!config || !config.folderId || !config.apiKey || config.apiKey === '***') return;

  try {
    const query = `'${config.folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&key=${config.apiKey}&fields=files(id,name,mimeType)`);
    if (!response.ok) return;

    const data = await response.json();
    const files = data.files || [];
    const processedIds = config.processedIds || [];
    
    // Find new files
    const newFiles = files.filter((f: any) => !processedIds.includes(f.id));
    
    if (newFiles.length > 0) {
      const taskId = addTask({
        type: 'UPLOAD',
        title: `Google Drive Auto-Sync: ${newFiles.length} files`,
        message: 'Downloading and extracting CVs...'
      });

      let currentProcessed = 0;
      for (const f of newFiles) {
        await downloadAndParseGoogleDriveCV(f, config.apiKey);
        currentProcessed++;
        updateTask(taskId, {
          percent: Math.round((currentProcessed / newFiles.length) * 100),
          message: `Processed ${currentProcessed} of ${newFiles.length} files`
        });
        processedIds.push(f.id);
        await api.saveGoogleDriveSettings({ ...config, processedIds });
      }

      updateTask(taskId, {
        status: 'completed',
        percent: 100,
        message: `Success! Auto-synced ${newFiles.length} CVs.`
      });
      
      // Dispatch an event so experts list can update
      window.dispatchEvent(new Event('expertsUpdated'));
    }
  } catch (error) {
    console.error("Background sync error:", error);
  }
}
