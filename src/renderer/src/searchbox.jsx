import React, { useState, useMemo, useRef, useEffect } from 'react'

/**
 * SearchBox — searches bone name + description, and on selection
 * triggers highlight + camera fly-to in the 3D view.
 *
 * Assumed bone shape (adjust field names to match your bones-data.json):
 * {
 *   id: string,
 *   name: string,          // e.g. "Femur"
 *   nameFr?: string,       // optional French name
 *   description: string,   // detail text shown in your info panel
 * }
 *
 * Props:
 * - bones: array of bone objects (your full bones-data.json list)
 * - onSelectBone: (bone) => void  — call your existing select + flyTo logic here
 */
export default function SearchBox({ bones, onSelectBone }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    return bones
      .map((bone) => {
        const name = (bone.name || bone.id || '').toLowerCase()
        const namefr = (bone.namefr || '').toLowerCase()
        const desc = (bone.description || '').toLowerCase()

        let score = 0
        if (name === q || namefr === q) score = 100
        else if (name.startsWith(q) || namefr.startsWith(q)) score = 80
        else if (name.includes(q) || namefr.includes(q)) score = 60
        else if (desc.includes(q)) score = 20
        else return null

        return { bone, score }
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.bone)
  }, [query, bones])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function selectBone(bone) {
    if (!bone) return
    onSelectBone(bone)
    setQuery(bone.namefr)
    setIsOpen(false)
    inputRef.current?.blur()
  }

  function handleKeyDown(e) {
    if (!isOpen || results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectBone(results[activeIndex])
    } else if (e.key === 'Escape') {
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
        placeholder="Rechercher un os..."
        onChange={(e) => {
          setQuery(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => query && setIsOpen(true)}
        onKeyDown={handleKeyDown}
        className="search-input"
      />

      {isOpen && results.length > 0 && (
        <ul className="search-dropdown">
          {results.map((bone, i) => (
            <li
              key={bone.id} // Changed from bone.namefr to unique bone.id
              onMouseDown={() => selectBone(bone)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`search-item ${i === activeIndex ? 'active' : ''}`}
            >
              <div className="search-item-name">
                {highlightMatch(bone.namefr, query)}
                {bone.namefr && bone.namefr !== bone.name && (
                  <span className="search-item-namefr"> — {bone.namefr}</span>
                )}
              </div>
              {bone.description && (
                <div className="search-item-desc">
                  {bone.description.length > 90
                    ? bone.description.slice(0, 90) + '…'
                    : bone.description}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOpen && query.trim() && results.length === 0 && (
        <div className="search-no-results">Aucun résultat</div>
      )}
    </div>
  )
}
