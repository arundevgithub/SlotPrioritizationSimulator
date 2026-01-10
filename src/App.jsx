import { useState, useMemo } from 'react'
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
  const timeSlots = useMemo(() => generateTimeSlots(), [])
  
  // Sort providers by license count (ascending - fewer licenses first)
  const sortedProviders = useMemo(() => {
    return [...providers].sort((a, b) => a.licenses - b.licenses)
  }, [providers])

  // Check if a slot is selected for a provider
  const isSlotSelected = (providerId, slotId) => {
    return selectedSlots[providerId]?.[slotId] || false
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
    const exponentialTerm = 0.2 * Math.exp(-1.2 * (licenses - 1))
    return 0.8 * x + exponentialTerm
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>Healthcare Provider Slot Prioritization Simulator</h1>
        <p className="equation-info">
          Availability Score Formula: <strong>y = 0.8x + 0.2e^(-1.2(b-1))</strong><br />
          Where: y = availability score, x = (slots remaining)/(total slots), b = number of licenses
        </p>
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
                    const maxScoreProviderId = getMaxScoreProviderForSlot(slot.id)
                    const isMaxScore = !isSelected && maxScoreProviderId === provider.id
                    const isEnabled = isMaxScore || isSelected // Enable only if max score or already selected
                    
                    return (
                      <td key={slot.id} className="slot-cell">
                        <label
                          className={`slot-checkbox-label ${isSelected ? 'selected' : ''} ${isMaxScore ? 'max-score' : ''} ${!isEnabled ? 'disabled' : ''}`}
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
