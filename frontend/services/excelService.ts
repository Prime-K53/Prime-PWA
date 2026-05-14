
export const exportToCSV = (data: any[], filename: string) => {
  if (!data || data.length === 0) {
    alert("No data to export");
    return;
  }

  // Extract headers
  const headers = Object.keys(data[0]);
  
  // Convert to CSV string
  const csvContent = [
    headers.join(','), // Header row
    ...data.map(row => headers.map(fieldName => {
      const value = row[fieldName];
      // Handle strings with commas or newlines by wrapping in quotes
      const stringValue = value === null || value === undefined ? '' : String(value);
      return `"${stringValue.replace(/"/g, '""')}"`; // Escape quotes
    }).join(','))
  ].join('\n');

  // Create Blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const parseCSV = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        resolve([]);
        return;
      }

      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length < 2) {
        resolve([]);
        return;
      }

      const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
      
      const result = lines.slice(1).map(line => {
        // Simple split by comma, handling quotes is complex but this works for basic CSVs
        // For a robust solution, a library like PapaParse is usually recommended
        const values = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
        
        const obj: any = {};
        headers.forEach((header, index) => {
          let val: any = values[index];
          
          // Basic type inference
          if (!isNaN(Number(val)) && val !== '') {
            val = Number(val);
          }
          
          obj[header] = val;
        });
        return obj;
      });

      resolve(result);
    };

    reader.onerror = (error) => reject(error);
    reader.readAsText(file);
  });
};
