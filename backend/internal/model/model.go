package model

import "gorm.io/gorm"

var DB *gorm.DB
var LOG_DB *gorm.DB

const (
	LogTypeConsume          = 2
	LogTypeError            = 5
	LogTypeRefund           = 6
	LogTypePreConsume       = 7
	LogTypeAdditionalCharge = 8
)
