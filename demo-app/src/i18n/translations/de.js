const de = {
  app: {
    workspaceAria: 'Agenten-Arbeitsbereich',
  },
  status: {
    online: 'Online',
    busy: 'Beschaeftigt',
    offline: 'Offline',
  },
  sidebar: {
    ariaLabel: 'Agentenliste',
    brandSubtitle: 'Agentic Workspace',
    activeAgents: 'Aktive Agenten',
    agentsCountSuffix: 'Agenten',
    availableAgentsAria: 'Verfuegbare Agenten',
    noMessagesYet: 'Noch keine Nachrichten.',
    uploadedFile: 'Hochgeladen: {name}',
    secureTransport: 'Sicherer Transport aktiv',
    languageSwitchAria: 'Sprache wechseln',
  },
  chat: {
    conversationAria: 'Konversation mit {agent}',
    readyChip: 'Bereit zu helfen',
    emptyTitle: 'Starte mit einer klaren Aufgabe fuer {agent}',
    hints: ['Datei zusammenfassen', 'Risikoklauseln finden', 'Schnellen Bericht bauen'],
    typingAria: '{agent} schreibt',
    workingLabel: '{agent} arbeitet',
    attachFileAria: 'Datei anhaengen',
    messagePlaceholder: 'Nachricht an {agent}...',
    sendMessageAria: 'Nachricht senden',
    clearHistoryAria: 'Chat-Verlauf fuer {agent} loeschen',
    clearHistoryTooltip: 'Chat-Verlauf loeschen',
    clearHistoryConfirm: 'Alle Nachrichten im Chat mit {agent} loeschen?',
    uploadingStatus: 'Datei wird hochgeladen',
    dispatchingStatus: 'Anfrage wird gestartet',
    runningStatus: 'Warte auf Agent-Ausgabe',
    completedStatus: 'Abgeschlossen',
    completedWithFilesStatus: 'Abgeschlossen mit Dateien',
    errorStatus: 'Lauf fehlgeschlagen',
    footnote: 'GolemForce-Simulationsumgebung fuer Demo-Gespraeche',
    uploadFootnote: 'Unterstuetzte Dateien: PDF, Excel, Word, PowerPoint (max. 25 MB)',
    fileTooLarge: 'Datei ist zu gross. Maximale Groesse ist {maxSize}.',
    fileTypeError:
      'Nicht unterstuetzter Dateityp. Lade PDF-, Excel-, Word- oder PowerPoint-Dateien hoch.',
    selectedFileLabel: 'Ausgewaehlte Datei',
    removeAttachmentAria: 'Anhang entfernen',
    removeAttachmentLabel: 'Entfernen',
    downloadArtifactLabel: 'Download',
    generatedFileLabel: 'Erzeugte Datei',
    emptyAssistantResponse: 'Das Backend hat keine Assistant-Antwort zurueckgegeben.',
    backendErrorPrefix: 'Backend nicht erreichbar. Bitte erneut versuchen.',
    pendingTimeout:
      'Der Lauf ist noch ausstehend. Bitte gleich erneut versuchen oder Chat-Verlauf aktualisieren.',
  },
  agents: {
    'excel-analyst': {
      name: 'Excel-Analyst',
      description: 'Tabellen analysieren, Berichte erstellen, Daten transformieren',
      greeting:
        'Hey! Ich bin dein Excel-Analyst. Ich kann dir helfen, Tabellen zu analysieren, Pivot-Tabellen zu erstellen, Daten zu bereinigen, Formeln zu bauen und Berichte zu erstellen. Lade eine Datei hoch oder sag mir, was du brauchst.',
      hints: ['Revenue-Pivot bauen', 'Kaputte Formeln finden', 'Doppelte Zeilen bereinigen'],
      responses: [
        'Ich habe die Tabelle analysiert. Das habe ich gefunden:\n\n**Zusammenfassung:**\n- 1.247 Zeilen mit Transaktionsdaten\n- 3 Spalten mit fehlenden Werten\n- Umsatztrend liegt bei +12% QoQ\n\nSoll ich einen detaillierten Bericht erstellen oder eine Pivot-Tabelle anlegen?',
        'Fertig! Ich habe eine Pivot-Tabelle erstellt, die den Umsatz nach Region und Quartal aufschluesselt. Die DACH-Region zeigt mit 18,3% das staerkste Wachstum. Soll ich das als neues Blatt exportieren?',
        'Ich habe den Datensatz bereinigt - 23 doppelte Zeilen entfernt und 47 fehlende Werte per Interpolation ergaenzt. Die Daten sind bereit fuer die Analyse. Was moechtest du als Naechstes untersuchen?',
        'Hier ist die Formel, die du brauchst:\n\n```\n=VLOOKUP(A2, Sheet2!$A:$D, 3, FALSE)\n```\n\nDamit wird der passende Wert aus Spalte C von Sheet2 geholt. Soll ich sie auf alle Zeilen anwenden?',
      ],
    },
    'pdf-agent': {
      name: 'PDF-Agent',
      description: 'Daten extrahieren, Dokumente zusammenfassen, Fragen beantworten',
      greeting:
        'Hi! Ich bin dein PDF-Agent. Ich kann Informationen aus PDFs extrahieren, Dokumente zusammenfassen, Fragen zu Vertraegen beantworten und strukturierte Daten aus Dokumenten ziehen. Wobei kann ich helfen?',
      hints: ['Vertrag zusammenfassen', 'Schluesselklauseln extrahieren', 'Finanzzahlen herausziehen'],
      responses: [
        'Ich habe das Dokument durchgesehen. Hier ist eine kurze Zusammenfassung:\n\n**Vertragsueberblick:**\n- Typ: Gewerbemietvertrag\n- Laufzeit: 36 Monate\n- Monatliche Miete: EUR 4.500\n- Sonderkuendigung: Nach 12 Monaten mit 3 Monaten Frist\n\nSoll ich ungewoehnliche Klauseln markieren?',
        'Ich habe 3 Klauseln gefunden, die Aufmerksamkeit brauchen:\n\n1. **Abschnitt 4.2** - Automatische Verlaengerung ohne ausdrueckliches Opt-out\n2. **Abschnitt 7.1** - Mieter haftet fuer strukturelle Reparaturen (ungewoehnlich)\n3. **Abschnitt 9.3** - Wettbewerbsverbot im Radius von 15 km (recht weit)\n\nSoll ich eine Zusammenfassung fuer euer Legal-Team erstellen?',
        'Ich habe alle Objektdetails aus dem Expose-PDF extrahiert:\n\n| Feld | Wert |\n|------|------|\n| Adresse | Favoritenstrasse 224, 1100 Wien |\n| Flaeche | 185 m2 |\n| Zimmer | 6 |\n| Baujahr | 2019 |\n| Energieklasse | A+ |\n\nSoll ich das mit aehnlichen Angeboten vergleichen?',
        'Ich habe die wichtigsten Finanzkennzahlen aus dem Jahresbericht zusammengestellt:\n\n- **Umsatz:** EUR 2,3 Mio. (+15% YoY)\n- **EBITDA:** EUR 420 Tsd.\n- **Nettomarge:** 18,2%\n\nIm Dokument wird ausserdem eine geplante Expansion in den deutschen Markt in Q3 erwaehnt. Soll ich einen Abschnitt genauer analysieren?',
      ],
    },
    'powerpoint-maker': {
      name: 'PowerPoint-Maker',
      description: 'Umsatzstarke Praesentationen, Executive Storylines und klare Folien',
      greeting:
        'Hi! Ich bin dein PowerPoint-Maker. Gib mir Unternehmensziele, Kennzahlen und Zielgruppe, dann erstelle ich eine Praesentation mit klarer Umsatzstory von Problem bis Wachstumsplan.',
      hints: ['Board-Deck erstellen', 'KPIs in Slides verwandeln', 'Revenue-Storyline bauen'],
      responses: [
        'Ich habe ein 12-Folien-Deck mit klarer Revenue-Story erstellt:\n\n1. Marktchance\n2. Umsatzentwicklung\n3. Wachstumshebel\n4. 90-Tage-Umsetzungsplan\n\nSoll ich es fuer Board, Investoren oder Sales Leadership zuschneiden?',
        'Ich habe eure KPI-Daten in folienreife Visuals ueberfuehrt:\n\n- Umsatz-CAGR: 21,4%\n- Rohertrag von 48% auf 56% verbessert\n- CAC-Payback auf 4,2 Monate gesenkt\n\nIch kann jetzt Speaker Notes fuer jede Folie erzeugen.',
        'Ich habe einen ueberzeugenden Pricing- und Upsell-Abschnitt vorbereitet:\n\n| Hebel | Einfluss auf ARR | Sicherheit |\n|-------|------------------|------------|\n| Tiered Packaging | +8-12% | Hoch |\n| Jahresvorauszahlung | +4-6% | Mittel |\n| Enterprise Add-ons | +6-9% | Hoch |\n\nSoll ich das als Kapitel "Revenue Acceleration" in das Deck einfuegen?',
        'Ich habe die Praesentationsstruktur fuer maximale Executive-Klarheit finalisiert:\n\n- Eine Kernbotschaft pro Folie\n- Nur datenbasierte Aussagen\n- Starker Abschluss mit prognostizierten Umsatzwirkungen\n\nWenn du willst, erstelle ich eine Client-Version und eine interne Strategie-Version.',
      ],
    },
  },
}

export default de
