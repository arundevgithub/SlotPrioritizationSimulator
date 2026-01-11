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
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const timeSlots = useMemo(() => generateTimeSlots(), [])
  const simulationIntervalRef = useRef(null)
  
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

  // Calculate total selected slots for a provider
  const getTotalSelectedSlots = (providerId) => {
    return Object.values(selectedSlots[providerId] || {}).filter(Boolean).length
  }

  // Calculate availability score: y = 0.8x + 0.2e^(-1.2(b-1))
  // where x = (slots remaining for a provider) / (total number of slots)
  // b is the number of licenses, and e is Euler's number
  const calculateAvailabilityScore = (providerId, licenses) => {
    if (licenses === 0) return Infinity // Avoid division issues
    const totalSlots = timeSlots.length
    const selectedSlotsCount = getTotalSelectedSlots(providerId)
    const slotsRemaining = totalSlots - selectedSlotsCount
    const x = slotsRemaining / totalSlots
    const exponentialTerm = 0.8 * Math.exp(-1.2 * (licenses - 1))
    return 0.2 * x + exponentialTerm
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
      const roundedScore = Math.round(rawScore * 100) / 100 // Round to 2 decimal places
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

  // Get all available (highlighted) slots sorted by time
  // This is a helper that calculates available slots given a state snapshot
  const getAvailableSlotsForState = useCallback((currentSelectedSlots) => {
    const availableSlots = []
    timeSlots.forEach((slot) => {
      // Calculate max score provider for this slot with given state
      const availableProviders = sortedProviders.filter(provider => 
        !currentSelectedSlots[provider.id]?.[slot.id]
      )
      
      if (availableProviders.length === 0) return
      
      const providerScores = availableProviders.map(provider => {
        const totalSlots = timeSlots.length
        const selectedCount = Object.values(currentSelectedSlots[provider.id] || {}).filter(Boolean).length
        const slotsRemaining = totalSlots - selectedCount
        const x = slotsRemaining / totalSlots
        const exponentialTerm = 0.2 * Math.exp(-1.2 * (provider.licenses - 1))
        const rawScore = 0.8 * x + exponentialTerm
        const roundedScore = Math.round(rawScore * 100) / 100
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
      
      availableSlots.push({
        slotId: slot.id,
        providerId: selectedProviderId,
        timeIndex: timeSlots.findIndex(s => s.id === slot.id)
      })
    })
    return availableSlots.sort((a, b) => a.timeIndex - b.timeIndex)
  }, [timeSlots, sortedProviders])

  // Run one simulation iteration
  const runSimulationIteration = useCallback(() => {
    // Clear previous iteration's highlights
    setNewlySelectedSlots({})
    
    setSelectedSlots(prev => {
      const availableSlots = getAvailableSlotsForState(prev)
      
      if (availableSlots.length === 0) {
        return prev
      }

      // Create a copy of current state
      let newState = JSON.parse(JSON.stringify(prev))
      const newlySelected = {} // Track newly selected slots for this iteration

      // First selection: from first 20% of earliest available slots
      if (availableSlots.length > 0) {
        const first20Percent = Math.max(1, Math.ceil(availableSlots.length * 0.2))
        const first20Slots = availableSlots.slice(0, first20Percent)
        const randomSlot1 = first20Slots[Math.floor(Math.random() * first20Slots.length)]
        if (!newState[randomSlot1.providerId]) newState[randomSlot1.providerId] = {}
        newState[randomSlot1.providerId][randomSlot1.slotId] = true
        // Track newly selected
        if (!newlySelected[randomSlot1.providerId]) newlySelected[randomSlot1.providerId] = {}
        newlySelected[randomSlot1.providerId][randomSlot1.slotId] = true
      }

      // Recalculate available slots after first selection
      const availableSlotsAfter1 = getAvailableSlotsForState(newState)
      
      // Second selection: from first 40% of earliest available slots
      if (availableSlotsAfter1.length > 0) {
        const first40Percent = Math.max(1, Math.ceil(availableSlotsAfter1.length * 0.4))
        const first40Slots = availableSlotsAfter1.slice(0, first40Percent)
        const randomSlot2 = first40Slots[Math.floor(Math.random() * first40Slots.length)]
        if (!newState[randomSlot2.providerId]) newState[randomSlot2.providerId] = {}
        newState[randomSlot2.providerId][randomSlot2.slotId] = true
        // Track newly selected
        if (!newlySelected[randomSlot2.providerId]) newlySelected[randomSlot2.providerId] = {}
        newlySelected[randomSlot2.providerId][randomSlot2.slotId] = true
      }

      // Recalculate available slots after second selection
      const availableSlotsAfter2 = getAvailableSlotsForState(newState)
      
      // Third selection: from first 60% of earliest available slots
      if (availableSlotsAfter2.length > 0) {
        const first60Percent = Math.max(1, Math.ceil(availableSlotsAfter2.length * 0.6))
        const first60Slots = availableSlotsAfter2.slice(0, first60Percent)
        const randomSlot3 = first60Slots[Math.floor(Math.random() * first60Slots.length)]
        if (!newState[randomSlot3.providerId]) newState[randomSlot3.providerId] = {}
        newState[randomSlot3.providerId][randomSlot3.slotId] = true
        // Track newly selected
        if (!newlySelected[randomSlot3.providerId]) newlySelected[randomSlot3.providerId] = {}
        newlySelected[randomSlot3.providerId][randomSlot3.slotId] = true
      }

      // Set newly selected slots for highlighting
      setNewlySelectedSlots(newlySelected)

      return newState
    })
  }, [getAvailableSlotsForState])

  // Check if simulation should stop (all slots selected)
  useEffect(() => {
    if (isPlaying && !isPaused) {
      const availableSlots = getAvailableSlotsForState(selectedSlots)
      if (availableSlots.length === 0) {
        setIsPlaying(false)
        setIsPaused(false)
      }
    }
  }, [selectedSlots, isPlaying, isPaused, getAvailableSlotsForState])

  // Simulation loop
  useEffect(() => {
    if (isPlaying && !isPaused) {
      simulationIntervalRef.current = setInterval(() => {
        runSimulationIteration()
      }, 1440) // Run every 1440ms (75% slower than original)
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
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Healthcare Provider Slot Prioritization Simulator</h1>
        <p className="equation-info">
          Availability Score Formula: <strong>y = 0.8x + 0.2e^(-1.2(b-1))</strong><br />
          Where: y = availability score, x = (slots remaining)/(total slots), b = number of licenses
        </p>
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
              <th className="licenses-col"># of states licensed</th>
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
                    const maxScoreProviderId = getMaxScoreProviderForSlot(slot.id)
                    const isMaxScore = !isSelected && maxScoreProviderId === provider.id
                    const isEnabled = isMaxScore || isSelected // Enable only if max score or already selected
                    
                    return (
                      <td key={slot.id} className="slot-cell">
                        <label
                          className={`slot-checkbox-label ${isSelected ? 'selected' : ''} ${isMaxScore ? 'max-score' : ''} ${!isEnabled ? 'disabled' : ''} ${isNewlySelectedSlot ? 'newly-selected' : ''}`}
                          title={`Score: ${score.toFixed(3)}${isMaxScore ? ' (Max - Next Available)' : !isEnabled ? ' (Not Available)' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSlot(provider.id, slot.id)}
                            disabled={!isEnabled}
                          />
                          <span className="score-indicator">{score.toFixed(2)}</span>
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
