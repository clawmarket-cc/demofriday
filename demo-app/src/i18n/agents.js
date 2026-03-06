import excelLogo from '../assets/agent-icons/excel.svg'
import pdfLogo from '../assets/agent-icons/pdf.svg'
import powerpointLogo from '../assets/agent-icons/powerpoint.svg'

export const agentDefinitions = [
  {
    id: 'excel-analyst',
    backendName: 'Excel Analyst',
    color: '#22c55e',
    logo: excelLogo,
    icon: 'XLS',
    status: 'online',
  },
  {
    id: 'pdf-agent',
    backendName: 'PDF Agent',
    color: '#ef4444',
    logo: pdfLogo,
    icon: 'PDF',
    status: 'online',
  },
  {
    id: 'powerpoint-maker',
    backendName: 'PowerPoint Maker',
    color: '#0ea5e9',
    logo: powerpointLogo,
    icon: 'PPT',
    status: 'online',
    isVisibleInUi: false,
  },
]
