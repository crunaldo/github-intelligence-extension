import React from 'react'

interface ExtHeaderBrandProps {
  tag?: string
}

export const ExtHeaderBrand: React.FC<ExtHeaderBrandProps> = ({ tag }) => {
  const logoUrl =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('icons/icon48.png')
      : './icons/icon48.png'

  return (
    <div className="ext-brand">
      <div className="ext-logo-squircle">
        <img
          src={logoUrl}
          alt="GitHub Intelligence Assistant"
          width={28}
          height={28}
          className="ext-logo-squircle-img"
        />
      </div>
      <div className="ext-brand-title">
        <span className="ext-brand-main">GitHub Intelligence</span>
        <span className="ext-brand-accent">Assistant</span>
        {tag && <span className="ext-brand-tag">{tag}</span>}
      </div>
    </div>
  )
}
