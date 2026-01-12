import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import './App.css'

// Generate time slots from 10am to 1pm (10-minute intervals)
const generateTimeSlots = () => {
  const slots = []
  const startHour = 10
  const endHour = 13 // 1pm
  const intervalMinutes = 10
  
  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += intervalMinutes) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
      slots.push({
        id: `${hour}-${minute}`,
        time: timeString,
        displayTime: new Date(2024, 0, 1, hour, minute).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })
      })
    }
  }
  return slots
}

// Sample healthcare providers with different licenses
const initialProviders = [
  { id: 1, name: 'NP Smith', licenses: 3 },
  { id: 2, name: 'NP Johnson', licenses: 2 },
  { id: 3, name: 'NP Williams', licenses: 5 },
  { id: 4, name: 'NP Brown', licenses: 1 },
  { id: 5, name: 'NP Davis', licenses: 4 },
  { id: 6, name: 'NP Anderson', licenses: 10 },
  { id: 7, name: 'NP Taylor', licenses: 15 }
]

function App() {
  const [providers, setProviders] = useState(initialProviders)
  const [selectedSlots, setSelectedSlots] = useState({}) // { providerId: { slotId: true } }
  const [newlySelectedSlots, setNewlySelectedSlots] = useState({}) // { providerId: { slotId: true } } - for highlighting
  const [pendingSelectionSlots, setPendingSelectionSlots] = useState({}) // { providerId: { slotId: true } } - for red border before selection
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [weight1, setWeight1] = useState(0.8) // Weight for x term
  const [weight2, setWeight2] = useState(0.2) // Weight for exponential term
  const timeSlots = useMemo(() => generateTimeSlots(), [])
  const simulationIntervalRef = useRef(null)
  const simulationInProgressRef = useRef(false)
  
  // Sort providers by license count (ascending - fewer licenses first)
  const sortedProviders = useMemo(() => {
    return [...providers].sort((a, b) => a.licenses - b.licenses)
  }, [providers])

  // Check if a slot is selected for a provider
  const isSlotSelected = (providerId, slotId) => {
    return selectedSlots[providerId]?.[slotId] || false
  }

  // Check if a slot is newly selected in current iteration
  const isNewlySelected = (providerId, slotId) => {
    return newlySelectedSlots[providerId]?.[slotId] || false
  }

  // Check if a slot is pending selection (will be selected in this iteration)
  const isPendingSelection = (providerId, slotId) => {
    return pendingSelectionSlots[providerId]?.[slotId] || false
  }

  // Calculate total selected slots for a provider
  const getTotalSelectedSlots = (providerId) => {
    return Object.values(selectedSlots[providerId] || {}).filter(Boolean).length
  }

  // Truncate a number to 2 decimal places (for display)
  const truncateToTwoDecimals = (num) => {
    return Math.floor(num * 100) / 100
  }

  // Format truncated number to 2 decimal places string
  const formatTruncatedScore = (num) => {
    const truncated = truncateToTwoDecimals(num)
    return truncated.toFixed(2)
  }

  // Calculate availability score: y = weight1*x + weight2*e^(-1.2(b-1))
  // where x = (slots remaining for a provider) / (total number of slots)
  // b is the number of licenses, and e is Euler's number
  const calculateAvailabilityScore = (providerId, licenses) => {
    if (licenses === 0) return Infinity // Avoid division issues
    const totalSlots = timeSlots.length
    const selectedSlotsCount = getTotalSelectedSlots(providerId)
    const slotsRemaining = totalSlots - selectedSlotsCount
    const x = slotsRemaining / totalSlots
    const exponentialTerm = Math.exp(-1.2 * (licenses - 1))
    return weight1 * x + weight2 * exponentialTerm
  }

  // Toggle slot selection for a provider
  const toggleSlot = (providerId, slotId) => {
    setSelectedSlots(prev => {
      const providerSlots = prev[providerId] || {}
      const isSelected = providerSlots[slotId]
      
      return {
        ...prev,
        [providerId]: {
          ...providerSlots,
          [slotId]: !isSelected
        }
      }
    })
  }

  // Get the provider ID with maximum score for a given slot (column)
  // Excludes already selected slots
  // In case of ties, randomly select one using slot ID as seed for stability
  const getMaxScoreProviderForSlot = (slotId) => {
    // Filter out providers that already have this slot selected
    const availableProviders = sortedProviders.filter(provider => 
      !isSlotSelected(provider.id, slotId)
    )
    
    if (availableProviders.length === 0) {
      return null // No available providers for this slot
    }
    
    const providerScores = availableProviders.map(provider => {
      const rawScore = calculateAvailabilityScore(provider.id, provider.licenses)
      const roundedScore = Math.floor(rawScore * 100) / 100 // Truncate to 2 decimal places
      return {
        id: provider.id,
        score: roundedScore,
        rawScore: rawScore // Keep raw score for display
      }
    })
    
    const maxScore = Math.max(...providerScores.map(p => p.score))
    const maxScoreProviders = providerScores.filter(p => p.score === maxScore) // Compare rounded scores
    
    if (maxScoreProviders.length === 1) {
      return maxScoreProviders[0].id
    }
    
    // Randomly select from tied providers using slot ID as seed for stability
    // Sort tied providers by ID first for consistency, then use hash for selection
    const sortedTiedProviders = maxScoreProviders.sort((a, b) => a.id - b.id)
    const slotHash = slotId.split('-').reduce((acc, val) => acc + parseInt(val || 0), 0)
    const randomIndex = slotHash % sortedTiedProviders.length
    return sortedTiedProviders[randomIndex].id
  }

  // Get all currently highlighted slots (using the same logic as rendering)
  // This ensures simulation only selects from actually highlighted slots
  const getHighlightedSlots = useCallback((currentSelectedSlots) => {
    const highlightedSlots = []
    timeSlots.forEach((slot) => {
      // Use the same logic as getMaxScoreProviderForSlot but with state snapshot
      const availableProviders = sortedProviders.filter(provider => 
        !currentSelectedSlots[provider.id]?.[slot.id]
      )
      
      if (availableProviders.length === 0) return
      
      const providerScores = availableProviders.map(provider => {
        const totalSlots = timeSlots.length
        const selectedCount = Object.values(currentSelectedSlots[provider.id] || {}).filter(Boolean).length
        const slotsRemaining = totalSlots - selectedCount
        const x = slotsRemaining / totalSlots
        const exponentialTerm = Math.exp(-1.2 * (provider.licenses - 1))
        const rawScore = weight1 * x + weight2 * exponentialTerm
        const roundedScore = Math.floor(rawScore * 100) / 100 // Truncate to 2 decimal places (match getMaxScoreProviderForSlot)
        return { id: provider.id, score: roundedScore }
      })
      
      const maxScore = Math.max(...providerScores.map(p => p.score))
      const maxScoreProviders = providerScores.filter(p => p.score === maxScore)
      
      let selectedProviderId
      if (maxScoreProviders.length === 1) {
        selectedProviderId = maxScoreProviders[0].id
      } else {
        const sortedTied = maxScoreProviders.sort((a, b) => a.id - b.id)
        const slotHash = slot.id.split('-').reduce((acc, val) => acc + parseInt(val || 0), 0)
        selectedProviderId = sortedTied[slotHash % sortedTied.length].id
      }
      
      highlightedSlots.push({
        slotId: slot.id,
        providerId: selectedProviderId,
        timeIndex: timeSlots.findIndex(s => s.id === slot.id)
      })
    })
    return highlightedSlots.sort((a, b) => a.timeIndex - b.timeIndex)
  }, [timeSlots, sortedProviders, weight1, weight2])

  // Helper function to get highlighted slots from current state
  const getCurrentHighlightedSlots = () => {
    const highlightedSlots = []
    timeSlots.forEach((slot) => {
      const maxScoreProviderId = getMaxScoreProviderForSlot(slot.id)
      if (maxScoreProviderId !== null) {
        highlightedSlots.push({
          slotId: slot.id,
          providerId: maxScoreProviderId,
          timeIndex: timeSlots.findIndex(s => s.id === slot.id)
        })
      }
    })
    return highlightedSlots.sort((a, b) => a.timeIndex - b.timeIndex)
  }

  // Calculate availability score with state snapshot (for simulation)
  const calculateAvailabilityScoreWithState = (providerId, licenses, stateSnapshot) => {
    if (licenses === 0) return Infinity
    const totalSlots = timeSlots.length
    const selectedCount = Object.values(stateSnapshot[providerId] || {}).filter(Boolean).length
    const slotsRemaining = totalSlots - selectedCount
    const x = slotsRemaining / totalSlots
    const exponentialTerm = Math.exp(-1.2 * (licenses - 1))
    return weight1 * x + weight2 * exponentialTerm
  }

  // Get highlighted provider for a slot with state snapshot (for simulation)
  const getMaxScoreProviderForSlotWithState = (slotId, stateSnapshot) => {
    const availableProviders = sortedProviders.filter(provider => 
      !stateSnapshot[provider.id]?.[slotId]
    )
    
    if (availableProviders.length === 0) {
      return null
    }
    
    const providerScores = availableProviders.map(provider => {
      const rawScore = calculateAvailabilityScoreWithState(provider.id, provider.licenses, stateSnapshot)
      const roundedScore = Math.floor(rawScore * 100) / 100
      return { id: provider.id, score: roundedScore }
    })
    
    const maxScore = Math.max(...providerScores.map(p => p.score))
    const maxScoreProviders = providerScores.filter(p => p.score === maxScore)
    
    if (maxScoreProviders.length === 1) {
      return maxScoreProviders[0].id
    }
    
    const sortedTiedProviders = maxScoreProviders.sort((a, b) => a.id - b.id)
    const slotHash = slotId.split('-').reduce((acc, val) => acc + parseInt(val || 0), 0)
    const randomIndex = slotHash % sortedTiedProviders.length
    return sortedTiedProviders[randomIndex].id
  }

  // Helper to get currently highlighted slots
  const getCurrentHighlighted = useCallback(() => {
    const highlighted = []
    timeSlots.forEach((slot) => {
      const maxScoreProviderId = getMaxScoreProviderForSlot(slot.id)
      if (maxScoreProviderId !== null) {
        highlighted.push({
          slotId: slot.id,
          providerId: maxScoreProviderId,
          timeIndex: timeSlots.findIndex(s => s.id === slot.id)
        })
      }
    })
    return highlighted.sort((a, b) => a.timeIndex - b.timeIndex)
  }, [timeSlots, sortedProviders, selectedSlots, weight1, weight2])

  // Helper to select a random slot from a percentage range
  const selectRandomSlotFromRange = (highlightedSlots, startPercent, endPercent) => {
    if (highlightedSlots.length === 0) return null
    
    const start = Math.ceil(highlightedSlots.length * startPercent)
    const end = Math.ceil(highlightedSlots.length * endPercent)
    
    if (end <= start) return null
    
    const rangeSlots = highlightedSlots.slice(start, end)
    if (rangeSlots.length === 0) return null
    
    const randomSlot = rangeSlots[Math.floor(Math.random() * rangeSlots.length)]
    
    // Verify it's actually highlighted
    if (getMaxScoreProviderForSlot(randomSlot.slotId) === randomSlot.providerId) {
      return randomSlot
    }
    return null
  }

  // Helper to select a slot from first N percent
  const selectRandomSlotFromFirstPercent = (highlightedSlots, percent) => {
    if (highlightedSlots.length === 0) return null
    
    const firstNPercent = Math.max(1, Math.ceil(highlightedSlots.length * percent))
    const firstNSlots = highlightedSlots.slice(0, firstNPercent)
    if (firstNSlots.length === 0) return null
    
    const randomSlot = firstNSlots[Math.floor(Math.random() * firstNSlots.length)]
    
    // Verify it's actually highlighted
    if (getMaxScoreProviderForSlot(randomSlot.slotId) === randomSlot.providerId) {
      return randomSlot
    }
    return null
  }

  // Helper to apply a slot selection
  const applySlotSelection = (slot, newlySelected, onComplete) => {
    if (!slot) {
      onComplete()
      return
    }

    setSelectedSlots(prev => {
      const newState = { ...prev }
      if (!newState[slot.providerId]) newState[slot.providerId] = {}
      newState[slot.providerId] = { ...newState[slot.providerId] }
      newState[slot.providerId][slot.slotId] = true
      
      // Track newly selected
      if (!newlySelected[slot.providerId]) newlySelected[slot.providerId] = {}
      newlySelected[slot.providerId][slot.slotId] = true
      
      return newState
    })

    // Wait for state update, then continue
    setTimeout(() => {
      onComplete()
    }, 200)
  }

  // Run one simulation iteration
  const runSimulationIteration = useCallback(() => {
    // Prevent overlapping iterations
    if (simulationInProgressRef.current) {
      return
    }
    
    simulationInProgressRef.current = true
    setNewlySelectedSlots({})
    setPendingSelectionSlots({}) // Clear previous pending selections
    
    const newlySelected = {}
    let highlightedSlots = getCurrentHighlighted()
    
    if (highlightedSlots.length === 0) {
      simulationInProgressRef.current = false
      return
    }

    // Calculate all 3 slots that will be selected in this iteration
    // First selection: from first 20%
    const slot1 = selectRandomSlotFromFirstPercent(highlightedSlots, 0.2)
    if (!slot1) {
      simulationInProgressRef.current = false
      return
    }

    // Simulate first selection to get updated highlighted slots
    let workingState = JSON.parse(JSON.stringify(selectedSlots))
    if (!workingState[slot1.providerId]) workingState[slot1.providerId] = {}
    workingState[slot1.providerId][slot1.slotId] = true
    
    // Get highlighted slots after first selection
    const highlightedAfter1 = getHighlightedSlots(workingState)
    
    // Second selection: from 20-50% range
    const slot2 = highlightedAfter1.length > 0 
      ? selectRandomSlotFromRange(highlightedAfter1, 0.2, 0.5)
      : null
    
    if (slot2) {
      // Simulate second selection
      if (!workingState[slot2.providerId]) workingState[slot2.providerId] = {}
      workingState[slot2.providerId][slot2.slotId] = true
    }
    
    // Get highlighted slots after second selection
    const highlightedAfter2 = slot2 ? getHighlightedSlots(workingState) : []
    
    // Third selection: from 50-70% range
    const slot3 = highlightedAfter2.length > 0
      ? selectRandomSlotFromRange(highlightedAfter2, 0.5, 0.7)
      : null

    // Set pending selections to show red border immediately
    const pending = {}
    if (slot1) {
      if (!pending[slot1.providerId]) pending[slot1.providerId] = {}
      pending[slot1.providerId][slot1.slotId] = true
    }
    if (slot2) {
      if (!pending[slot2.providerId]) pending[slot2.providerId] = {}
      pending[slot2.providerId][slot2.slotId] = true
    }
    if (slot3) {
      if (!pending[slot3.providerId]) pending[slot3.providerId] = {}
      pending[slot3.providerId][slot3.slotId] = true
    }
    setPendingSelectionSlots(pending)

    // Wait a bit before starting actual selection (delay between identification and selection)
    setTimeout(() => {
      // Now select them sequentially with delays
      if (slot1) {
        applySlotSelection(slot1, newlySelected, () => {
        // Remove from pending when actually selected
        setPendingSelectionSlots(prev => {
          const updated = { ...prev }
          if (updated[slot1.providerId]) {
            updated[slot1.providerId] = { ...updated[slot1.providerId] }
            delete updated[slot1.providerId][slot1.slotId]
            if (Object.keys(updated[slot1.providerId]).length === 0) {
              delete updated[slot1.providerId]
            }
          }
          return updated
        })
        
        highlightedSlots = getCurrentHighlighted()
        
        if (slot2) {
          applySlotSelection(slot2, newlySelected, () => {
            // Remove from pending when actually selected
            setPendingSelectionSlots(prev => {
              const updated = { ...prev }
              if (updated[slot2.providerId]) {
                updated[slot2.providerId] = { ...updated[slot2.providerId] }
                delete updated[slot2.providerId][slot2.slotId]
                if (Object.keys(updated[slot2.providerId]).length === 0) {
                  delete updated[slot2.providerId]
                }
              }
              return updated
            })
            
            highlightedSlots = getCurrentHighlighted()
            
            if (slot3) {
              applySlotSelection(slot3, newlySelected, () => {
                // Remove from pending when actually selected
                setPendingSelectionSlots(prev => {
                  const updated = { ...prev }
                  if (updated[slot3.providerId]) {
                    updated[slot3.providerId] = { ...updated[slot3.providerId] }
                    delete updated[slot3.providerId][slot3.slotId]
                    if (Object.keys(updated[slot3.providerId]).length === 0) {
                      delete updated[slot3.providerId]
                    }
                  }
                  return updated
                })
                
                setNewlySelectedSlots(newlySelected)
                simulationInProgressRef.current = false
              })
            } else {
              setNewlySelectedSlots(newlySelected)
              simulationInProgressRef.current = false
            }
          })
        } else {
          setNewlySelectedSlots(newlySelected)
          simulationInProgressRef.current = false
        }
      })
      }
    }, 750) // 750ms delay between showing red border and starting selection
  }, [getCurrentHighlighted, getMaxScoreProviderForSlot, selectedSlots, getHighlightedSlots])

  // Check if simulation should stop (all slots selected)
  useEffect(() => {
    if (isPlaying && !isPaused) {
      const highlightedSlots = getHighlightedSlots(selectedSlots)
      if (highlightedSlots.length === 0) {
        setIsPlaying(false)
        setIsPaused(false)
      }
    }
  }, [selectedSlots, isPlaying, isPaused, getHighlightedSlots])

  // Simulation loop
  useEffect(() => {
    if (isPlaying && !isPaused) {
      simulationIntervalRef.current = setInterval(() => {
        runSimulationIteration()
      }, 1440) // Run every 1440ms (50% slower)
    } else {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current)
        simulationIntervalRef.current = null
      }
    }

    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current)
      }
    }
  }, [isPlaying, isPaused, runSimulationIteration])

  // Handler functions for buttons
  const handlePlay = () => {
    setIsPlaying(true)
    setIsPaused(false)
  }

  const handlePause = () => {
    setIsPaused(true)
  }

  const handleEnd = () => {
    setIsPlaying(false)
    setIsPaused(false)
    setSelectedSlots({}) // Clear all selections
    setNewlySelectedSlots({}) // Clear highlighting
    setPendingSelectionSlots({}) // Clear pending selections
  }

  // Handle weight changes - ensure sum is always 1
  const handleWeight1Change = (newWeight1) => {
    const clampedWeight1 = Math.max(0.1, Math.min(0.9, newWeight1))
    const newWeight2 = 1 - clampedWeight1
    setWeight1(clampedWeight1)
    setWeight2(newWeight2)
    // Reset slots when weights change
    setSelectedSlots({})
    setNewlySelectedSlots({})
  }

  const handleWeight2Change = (newWeight2) => {
    const clampedWeight2 = Math.max(0.1, Math.min(0.9, newWeight2))
    const newWeight1 = 1 - clampedWeight2
    setWeight1(newWeight1)
    setWeight2(clampedWeight2)
    // Reset slots when weights change
    setSelectedSlots({})
    setNewlySelectedSlots({})
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Healthcare Provider Slot Prioritization Simulator</h1>
        <p className="equation-info">
          Availability Score Formula: <strong>y = {weight1.toFixed(1)}x + {weight2.toFixed(1)}e^(-1.2(b-1))</strong><br />
          Where: y = availability score, x = (slots remaining)/(total slots), b = number of licenses
        </p>
        <div className="weight-controls">
          <label className="weight-control">
            Weight 1 (x term): 
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.1"
              value={weight1}
              onChange={(e) => handleWeight1Change(parseFloat(e.target.value))}
            />
            <span>{weight1.toFixed(1)}</span>
          </label>
          <label className="weight-control">
            Weight 2 (e term): 
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.1"
              value={weight2}
              onChange={(e) => handleWeight2Change(parseFloat(e.target.value))}
            />
            <span>{weight2.toFixed(1)}</span>
          </label>
        </div>
        <div className="simulation-controls">
          <button 
            onClick={handlePlay} 
            disabled={isPlaying && !isPaused}
            className="sim-button play-button"
          >
            ▶ Play
          </button>
          <button 
            onClick={handlePause} 
            disabled={!isPlaying || isPaused}
            className="sim-button pause-button"
          >
            ⏸ Pause
          </button>
          <button 
            onClick={handleEnd}
            className="sim-button end-button"
          >
            ⏹ End
          </button>
        </div>
      </header>

      <div className="table-container">
        <table className="prioritization-table">
          <thead>
            <tr>
              <th className="provider-col">Provider</th>
              <th className="licenses-col">States licensed</th>
              {timeSlots.map((slot) => (
                <th key={slot.id} className="time-slot-header">
                  {slot.displayTime}
                </th>
              ))}
              <th className="total-col">Total Selected</th>
            </tr>
          </thead>
          <tbody>
            {sortedProviders.map((provider) => {
              // Calculate availability score for this provider (same across all slots)
              const score = calculateAvailabilityScore(provider.id, provider.licenses)
              
              return (
                <tr key={provider.id}>
                  <td className="provider-name-cell">
                    <strong>{provider.name}</strong>
                  </td>
                  <td className="licenses-cell">
                    <span className="licenses-badge">{provider.licenses}</span>
                  </td>
                  {timeSlots.map((slot) => {
                    const isSelected = isSlotSelected(provider.id, slot.id)
                    const isNewlySelectedSlot = isNewlySelected(provider.id, slot.id)
                    const isPendingSelectionSlot = isPendingSelection(provider.id, slot.id)
                    const maxScoreProviderId = getMaxScoreProviderForSlot(slot.id)
                    const isMaxScore = !isSelected && maxScoreProviderId === provider.id
                    const isEnabled = isMaxScore || isSelected // Enable only if max score or already selected
                    
                    return (
                      <td key={slot.id} className="slot-cell">
                        <label
                          className={`slot-checkbox-label ${isSelected ? 'selected' : ''} ${isMaxScore ? 'max-score' : ''} ${!isEnabled ? 'disabled' : ''} ${isNewlySelectedSlot ? 'newly-selected' : ''} ${isPendingSelectionSlot ? 'pending-selection' : ''}`}
                          title={`Score: ${formatTruncatedScore(score)}${isMaxScore ? ' (Max - Next Available)' : !isEnabled ? ' (Not Available)' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSlot(provider.id, slot.id)}
                            disabled={!isEnabled}
                          />
                          <span className="score-indicator">{formatTruncatedScore(score)}</span>
                        </label>
                      </td>
                    )
                  })}
                  <td className="total-cell">
                    <strong>{getTotalSelectedSlots(provider.id)}</strong>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="utc-footnote">* slot times are in UTC</p>
      </div>

      <div className="priority-order-info">
        <h3>Priority Order (Higher score = Higher priority)</h3>
        <p>
          Providers with fewer licenses (higher 1/b value) and more available slots (higher x) 
          get prioritized first. Hover over checkboxes to see availability scores.
        </p>
      </div>
    </div>
  )
}

export default App
