import React, { useState, useMemo, useRef, useEffect } from 'react'

function primaryName(entity) {
  return entity.namefr || entity.name || entity.id || ''
}

function secondaryName(entity) {
  const primary = primaryName(entity)
  if (entity.name && entity.name !== primary) return entity.name

  // First mesh alias that isn't a left/right variant — usually the English name.
  const alias = (entity.meshAliases || []).find((a) => a !== primary && !/\.(l|r)$/i.test(a))
  return alias || null
}

export default function SearchBox({ entities, onSelectEntity }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    return entities
      .map((entity) => {
        const primary = primaryName(entity).toLowerCase()
        const secondary = (secondaryName(entity) || '').toLowerCase()
        const id = (entity.id || '').toLowerCase()
        const description = (entity.description || '').toLowerCase()
        const aliases = (entity.meshAliases || []).join(' ').toLowerCase()

        let score = 0
        if (primary === q) score = 100
        else if (primary.startsWith(q)) score = 80
        else if (primary.includes(q)) score = 60
        else if (secondary.includes(q)) score = 55
        else if (id.includes(q)) score = 40
        else if (aliases.includes(q)) score = 35
        else if (description.includes(q)) score = 20
        else return null

        return { entity, score }
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.entity)
  }, [query, entities])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function selectEntity(entity) {
    if (!entity) return
    onSelectEntity(entity)
    setQuery(primaryName(entity))
    setIsOpen(false)
    inputRef.current?.blur()
  }

  function handleKeyDown(event) {
    if (!isOpen || results.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => (i - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      selectEntity(results[activeIndex])
    } else if (event.key === 'Escape') {
      setIsOpen(false)
      inputRef.current?.blur()
    }
  }

  function highlightMatch(text, q) {
    if (!q) return text
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className="search-mark">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  return (
    <div ref={containerRef} className="search-container">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Rechercher une structure..."
        onChange={(event) => {
          setQuery(event.target.value)
          setIsOpen(true)
        }}
        onFocus={() => query && setIsOpen(true)}
        onKeyDown={handleKeyDown}
        className="search-input"
      />

      {isOpen && results.length > 0 && (
        <ul className="search-dropdown">
          {results.map((entity, i) => {
            const primary = primaryName(entity)
            const secondary = secondaryName(entity)
            return (
              <li
                key={entity.id}
                onMouseDown={() => selectEntity(entity)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`search-item ${i === activeIndex ? 'active' : ''}`}
              >
                <div className="search-item-name">
                  {highlightMatch(primary, query)}
                  {secondary && <span className="search-item-namefr"> — {secondary}</span>}
                </div>
                {entity.description && (
                  <div className="search-item-desc">
                    {entity.description.length > 90
                      ? entity.description.slice(0, 90) + '…'
                      : entity.description}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {isOpen && query.trim() && results.length === 0 && (
        <div className="search-no-results">Aucun résultat</div>
      )}
    </div>
  )
}
